# Hosting Screener on Ubuntu VPS (tc-screener.com)

## Architecture Overview

```
Internet → tc-screener.com (DNS at Porkbun)
              ↓
         Nginx (port 80/443) — reverse proxy + SSL terminator
         ├── / → serves index.html (static frontend)
         ├── /api → proxies to Spring Boot (port 8080)
         └── /ws  → proxies WebSocket to Spring Boot (port 8080)
                        ↓
                  Spring Boot (Tomcat/MVC, not Netty)
                        ↓
                  PostgreSQL (port 5432, local only)
```

Nginx sits in front of everything. It serves the static HTML directly and forwards API and WebSocket traffic to Spring Boot. Spring Boot connects to a local PostgreSQL instance. Flyway runs automatically on startup and creates all database tables — no manual DDL is needed.

---

## One-Time Local Setup — Fix the JAR Name

By default Maven produces `screener-backend-0.0.1-SNAPSHOT.jar`. Add a fixed name so the `scp` command stays the same on every deploy regardless of the version field.

In `pom.xml`, inside the `<build>` block, add `<finalName>`:

```xml
<build>
    <finalName>screener</finalName>
    <plugins>
        ...
    </plugins>
</build>
```

After this change `./mvnw clean package -DskipTests` always produces `target/screener.jar`.

---

## Step 1 — Point Your Domain to the Server

In **Porkbun DNS settings**, create two A records:

| Type | Host | Value |
|------|------|-------|
| A | `@` | `<your-server-IP>` |
| A | `www` | `<your-server-IP>` |

DNS propagation takes a few minutes to a few hours. Verify with:

```bash
dig tc-screener.com
```

---

## Step 2 — Prepare the Server

SSH into your machine and install the essentials:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx certbot python3-certbot-nginx ufw openjdk-21-jdk postgresql postgresql-contrib
```

Set up the firewall:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'   # opens 80 and 443
sudo ufw enable
# Note: port 5432 (PostgreSQL) is intentionally NOT opened — DB is local only
```

---

## Step 3 — Configure PostgreSQL

Start and enable PostgreSQL:

```bash
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

Create the database and user:

```bash
sudo -u postgres psql
```

```sql
CREATE USER screener_user WITH PASSWORD 'your_strong_password_here';
CREATE DATABASE screener_db OWNER screener_user;
GRANT ALL PRIVILEGES ON DATABASE screener_db TO screener_user;
-- Required on PostgreSQL 15+ (Ubuntu 24.04+): grants CREATE in the public schema
GRANT ALL ON SCHEMA public TO screener_user;
\q
```

**Flyway handles all table creation automatically.** On the first app startup, Flyway connects as `screener_user`, creates a `flyway_schema_history` tracking table, and runs the three migration scripts (`V1__create_users`, `V2__create_refresh_tokens`, `V3__create_classification_rules`) in order. No manual `CREATE TABLE` statements are needed.

Verify Flyway ran successfully by checking the app logs after the first start:

```bash
sudo journalctl -u screener | grep -i flyway
```

You should see lines like `Successfully applied 3 migrations`.

---

## Step 4 — Set Up Environment Variables

The app reads four secrets from environment variables at startup. The bundled `application.yml` contains safe defaults for everything else (Binance URLs, WebSocket settings, Disruptor config) — those do not need to be configured on the server.

Create the app directory and the secrets file:

```bash
sudo mkdir -p /opt/screener
sudo nano /opt/screener/.env
```

Paste the following and fill in your values:

```
DB_URL=jdbc:postgresql://localhost:5432/screener_db
DB_USER=screener_user
DB_PASSWORD=your_strong_password_here
JWT_SECRET=<see below>
```

**Generating the JWT secret** — run this once on the server and copy the output into `.env`:

```bash
openssl rand -base64 32
```

This produces a 44-character base64 string (256-bit random key) used to sign and verify all access tokens. Keep this value safe — regenerating it invalidates every existing user session.

Lock down the file so only root can read it (systemd reads it as root before switching to the service user):

```bash
sudo chown root:root /opt/screener/.env
sudo chmod 600 /opt/screener/.env
```

---

## Step 5 — Build and Deploy the Spring Boot App

**Build the JAR locally** (requires the `<finalName>` change from the one-time setup above):

```bash
./mvnw clean package -DskipTests
```

**Copy the JAR to the server:**

```bash
scp target/screener.jar user@your-server-ip:/opt/screener/app.jar
```

**Fix ownership** so the service user can execute it:

```bash
sudo chown www-data:www-data /opt/screener/app.jar
```

**Create a systemd service** so the app starts automatically and restarts on crash:

```bash
sudo nano /etc/systemd/system/screener.service
```

```ini
[Unit]
Description=Screener Spring Boot App
After=network.target postgresql.service

[Service]
User=www-data
WorkingDirectory=/opt/screener
EnvironmentFile=/opt/screener/.env
ExecStart=/usr/bin/java \
  -Xms512m -Xmx1g \
  -XX:+UseZGC \
  -jar /opt/screener/app.jar
SuccessExitStatus=143
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

**JVM flag notes:**
- `-Xms512m -Xmx1g` — sized for a 2 GB VPS; caps the heap at 1 GB, leaving room for the OS, PostgreSQL, and JVM non-heap memory (Metaspace, thread stacks, Disruptor ring buffers)
- `-XX:+UseZGC` — ZGC (available in JDK 21) has sub-millisecond GC pause times; better suited to this app's latency goals than the default G1, which has periodic stop-the-world pauses

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable screener
sudo systemctl start screener
sudo systemctl status screener   # verify it's running on :8080
```

Watch the startup logs to confirm Flyway migrations ran and the app connected to Binance:

```bash
sudo journalctl -u screener -f
```

---

## Step 6 — Deploy the Frontend

```bash
sudo mkdir -p /var/www/screener
sudo cp index.html /var/www/screener/
sudo chown -R www-data:www-data /var/www/screener
```

---

## Step 7 — Configure Nginx

```bash
sudo nano /etc/nginx/sites-available/screener
```

```nginx
server {
    listen 80;
    server_name tc-screener.com www.tc-screener.com;

    root /var/www/screener;
    index index.html;

    # Serve frontend
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy REST API to Spring Boot
    location /api/ {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Proxy WebSocket connections
    location /ws {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

Enable it:

```bash
sudo ln -s /etc/nginx/sites-available/screener /etc/nginx/sites-enabled/
sudo nginx -t        # test config — must say "ok"
sudo systemctl reload nginx
```

---

## Step 8 — Enable HTTPS with Let's Encrypt

```bash
sudo certbot --nginx -d tc-screener.com -d www.tc-screener.com
```

Certbot automatically edits the Nginx config to add SSL and redirect HTTP → HTTPS, and sets up **auto-renewal** via a systemd timer.

Verify auto-renewal works:

```bash
sudo certbot renew --dry-run
```

---

## Step 9 — Frontend WebSocket URL

Use `wss://` (secure WebSocket) in your frontend since you now have HTTPS:

```javascript
const socket = new WebSocket("wss://tc-screener.com/ws");
```

---

## Deployment Checklist

| Step | What happens |
|------|-------------|
| DNS A records | tc-screener.com resolves to your server IP |
| UFW firewall | Ports 22, 80, 443 open; 5432 kept local |
| PostgreSQL | screener_db + screener_user created with full schema privileges |
| `/opt/screener/.env` | DB_URL, DB_USER, DB_PASSWORD, JWT_SECRET set; owned root:root, mode 600 |
| Spring Boot as systemd service | JVM heap capped at 1 GB, ZGC enabled, EnvironmentFile wired |
| Flyway migrations | Tables created automatically on first startup (check logs) |
| Nginx | Serves HTML + reverse proxies /api/ and /ws |
| Certbot | Free SSL cert, auto-renews every 90 days |

---

## Updating Code

**Backend** — back up current jar, rebuild, copy, fix ownership, restart.

**Step 0 — back up the currently-running jar.** The deploy command overwrites `/opt/screener/app.jar` in place, so save the live version first as a dated, stable backup. Copy (don't move) so the running file stays intact until the new jar lands cleanly:

```bash
ssh -p 3333 root@185.39.31.59 "sudo mkdir -p /opt/screener/backups && sudo cp /opt/screener/app.jar /opt/screener/backups/app-\$(date +%Y%m%d-%H%M%S)-stable.jar"
```

This produces e.g. `/opt/screener/backups/app-20260612-143000-stable.jar`. To roll back, copy a backup over `app.jar`, fix ownership, and restart the service (same commands as below). Optionally prune old backups to keep only the 5 newest:

```bash
ssh -p 3333 root@185.39.31.59 "ls -t /opt/screener/backups/*.jar | tail -n +6 | xargs -r sudo rm -f"
```

**Steps 1–3 — rebuild, copy, fix ownership, restart:**

```bash
./mvnw clean package -DskipTests
scp -P 3333 target/screener.jar root@185.39.31.59:/opt/screener/app.jar
ssh -p 3333 root@185.39.31.59 "sudo chown www-data:www-data /opt/screener/app.jar && sudo systemctl restart screener"
```

**Frontend** — just replace the file:

```bash
scp -P 3333 index.html root@185.39.31.59:/tmp/index.html
ssh -p 3333 root@185.39.31.59 "sudo cp /tmp/index.html /var/www/screener/"
```

**Check logs at any time:**

```bash
sudo journalctl -u screener -f   # live Spring Boot logs
sudo journalctl -u nginx -f      # live Nginx logs
```
