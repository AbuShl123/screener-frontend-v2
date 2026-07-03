# Screener Frontend

Real-time trading terminal for the crypto market screener backend. React + TypeScript
single-page app built with Vite.

## Stack

| Concern | Choice |
|---|---|
| Framework / language | React 19 + TypeScript |
| Build / dev server | Vite |
| Styling | Tailwind CSS v4 |
| Routing | React Router |
| Server state (REST) | TanStack Query |
| Real-time client state | Zustand (store outside React) |
| Validation | Zod |

## Getting started

```bash
npm install
cp .env.example .env.local   # then edit for your machine
npm run dev
```

The dev server runs at http://localhost:5173.

## Configuration

All config is read through **one** module — [`src/config/env.ts`](src/config/env.ts) —
which validates the environment at startup and fails fast if something is missing or
malformed. Nothing else reads `import.meta.env` directly.

Config comes from Vite `.env` files (build-time). Every `VITE_*` value is baked into the
client bundle and is therefore **public** — never put real secrets in them.

| File | Committed? | Purpose |
|---|---|---|
| `.env` | yes | Safe defaults (same-origin API, dev proxy → `localhost:8080`) |
| `.env.production` | yes | Production build values (real HTTPS backend) |
| `.env.example` | yes | Template to copy into `.env.local` |
| `.env.local` | **no** (gitignored) | Your machine-specific overrides |

### Local development

By default the browser talks to the Vite dev server same-origin, and Vite proxies `/api`
and `/ws` to your backend (`VITE_DEV_PROXY_TARGET`, default `http://localhost:8080`). This
avoids CORS entirely. To point at a backend elsewhere, set `VITE_DEV_PROXY_TARGET` in
`.env.local`.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the dev server (HMR) |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | Type-check without emitting |

## Structure

```
src/
  config/      env.ts — the single validated config source
  lib/         shared infra (query client; api/ and ws/ clients later)
  stores/      real-time state that lives OUTSIDE React (order book)
  features/    feature modules (auth, order book, rules, billing)
  components/   shared UI primitives
```
