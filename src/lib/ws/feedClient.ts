import { config } from '@/config/env';
import { refreshTokens, useSession } from '@/features/auth';
import { filterAnnounced, resetCooldown } from '@/features/orderbook/notifications/cooldown';
import type { FeedMessage, Level, OrderBook } from '@/features/orderbook/types';
import { useNotificationStore } from '@/stores/notificationStore';
import { useOrderbookStore } from '@/stores/orderbookStore';

/**
 * The `/ws` feed client: a small singleton state machine (not a class hierarchy)
 * that owns the socket, reconnection, and message coalescing. Framework-agnostic
 * — no React imports — exactly like `session.ts`. It reads tokens synchronously
 * from `useSession.getState()` (why tokens live in Zustand) and writes books into
 * `useOrderbookStore`. Protocol: `.claude/docs/websocket-feed-api.md`.
 *
 * Public API is two idempotent functions; `useOrderbookFeed` drives them from a
 * React effect.
 */

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
/** Refresh the token before dialing if it expires within this window (avoids a guaranteed 1008). */
const TOKEN_SKEW_MS = 5_000;
/** Background tabs throttle rAF; fall back to a timer so the buffer can't grow unbounded (doc §7, plan §5). */
const HIDDEN_FLUSH_MS = 100;
/** Sanity cap: if a burst somehow outpaces the frame flush, drain synchronously. */
const BUFFER_CAP = 1_000;

// ── Module-level singleton state (not in any store) ──
let ws: WebSocket | null = null;
let running = false; // start/stop idempotency + the StrictMode guard
let intentionalClose = false;
let backoff = INITIAL_BACKOFF_MS;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

// Coalescing buffer: messages accumulate here and flush once per animation frame.
let buffer: FeedMessage[] = [];
let rafHandle: number | null = null;
let hiddenTimer: ReturnType<typeof setTimeout> | null = null;

/** Idempotent — a second call while already running is a no-op (StrictMode-safe). */
export function startFeed(): void {
  if (running) return;
  running = true;
  intentionalClose = false;
  backoff = INITIAL_BACKOFF_MS;
  void connect();
}

/** Close the socket, cancel any pending reconnect + flush, and refuse to redial. */
export function stopFeed(): void {
  running = false;
  intentionalClose = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  cancelFlush();
  buffer = [];
  // Drop this session's notifications so logout / unmount doesn't leak them into the
  // next session (plan §6c). Harmless under StrictMode's mount→unmount→mount.
  useNotificationStore.getState().clear();
  // Forget cooldown history too, so the next session isn't silenced by the last one's.
  resetCooldown();
  if (ws) {
    const socket = ws;
    ws = null;
    // Detach handlers first so the close we trigger doesn't drive reconnection.
    socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
    try {
      socket.close();
    } catch {
      // Ignore — closing an already-closing/closed socket is fine.
    }
  }
}

async function connect(): Promise<void> {
  if (!running) return;

  // Belt-and-braces: never dial for a logged-out user (unmount cleanup already
  // stops the feed on logout, but a race could otherwise reach here).
  if (useSession.getState().status === 'anonymous') {
    stopFeed();
    return;
  }

  // Pre-connect token check: refresh a stale/near-expiry token before dialing.
  const { expiresAt } = useSession.getState();
  if (expiresAt != null && expiresAt - Date.now() <= TOKEN_SKEW_MS) {
    try {
      await refreshTokens();
    } catch {
      // refreshTokens() already hard-logged-out; just stop and flag auth failure.
      failAuth();
      return;
    }
    if (!running) return; // stopped while awaiting the refresh
  }

  const token = useSession.getState().accessToken;
  if (!token) {
    failAuth();
    return;
  }

  const url = `${config.wsBaseUrl}/ws?token=${encodeURIComponent(token)}`;
  const socket = new WebSocket(url);
  ws = socket;

  socket.onopen = () => {
    if (ws !== socket) return; // superseded by a newer connect
    backoff = INITIAL_BACKOFF_MS;
    useOrderbookStore.getState().setStatus('connected');
  };

  socket.onmessage = (e) => {
    if (ws !== socket) return;
    handleRawMessage(e.data);
  };

  socket.onclose = (e) => {
    if (ws !== socket) return; // a stale socket we've already replaced/detached
    ws = null;
    onClose(e);
  };

  // Errors are always followed by a close event, which drives reconnection — nothing to do here.
  socket.onerror = () => {};
}

function onClose(e: CloseEvent): void {
  // A dropped connection means our buffered-but-unflushed messages are now stale;
  // the fresh SNAPSHOT after reconnect rebuilds the store from scratch.
  cancelFlush();
  buffer = [];

  if (intentionalClose || !running) return;

  // 1008 is overloaded by the backend: a bad/expired token (fixable by refreshing)
  // and "no subscription" (NOT fixable by refreshing — the token is fine) both close
  // with this same code. Only the token case should refresh-and-immediately-retry;
  // treating both the same causes a same-token 1008 to loop as fast as the network
  // allows, since refreshTokens() keeps succeeding trivially.
  if (e.code === 1008) {
    if (isSubscriptionRequired(e.reason)) {
      running = false;
      ws = null;
      useOrderbookStore.getState().setStatus('access-denied');
      return;
    }

    refreshTokens()
      .then(() => {
        if (running) void connect();
      })
      .catch(() => {
        // Refresh failed → session already hard-logged-out; stop retrying the socket.
        failAuth();
      });
    return;
  }

  // Any other code (1001 eviction, 1006 network, …): reconnect with backoff.
  useOrderbookStore.getState().setStatus('reconnecting');
  scheduleReconnect();
}

/** The backend closes 1008 for "no subscription" too — distinguish it via the close reason. */
function isSubscriptionRequired(reason: string): boolean {
  return /subscription/i.test(reason);
}

function scheduleReconnect(): void {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  const delay = backoff + Math.random() * 500; // jitter so many clients don't sync up
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (running) void connect();
  }, delay);
  backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
}

/** Stop the feed and surface an auth failure to the UI. */
function failAuth(): void {
  running = false;
  ws = null;
  useOrderbookStore.getState().setStatus('auth-failed');
}

// ── Message ingestion: parse → cheap structural guard → buffer ──

function handleRawMessage(raw: unknown): void {
  if (typeof raw !== 'string') return;

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    if (config.isDev) console.warn('[feed] dropping unparseable message', raw);
    return; // keep the socket alive; drop the one bad message (plan §10)
  }

  const msg = coerceMessage(json);
  if (!msg) {
    if (config.isDev) console.warn('[feed] dropping malformed message', json);
    return;
  }

  buffer.push(msg);
  // Hard cap guards against a runaway burst (e.g. a wedged tab) outpacing the frame flush.
  if (buffer.length >= BUFFER_CAP) flush();
  else scheduleFlush();
}

const isMarket = (v: unknown): v is 'SPOT' | 'FUTURES' => v === 'SPOT' || v === 'FUTURES';

/**
 * Cheap structural guard (NOT Zod, per plan §3): switch on `type`, coerce the arrays
 * with a `[]` fallback, and otherwise trust the documented contract. Returns null for
 * anything unrecognized so the caller can drop it. `seq` is accepted but ignored (§5).
 */
function coerceMessage(json: unknown): FeedMessage | null {
  if (typeof json !== 'object' || json === null) return null;
  const m = json as Record<string, unknown>;

  switch (m.type) {
    case 'SNAPSHOT':
      return {
        seq: 0,
        type: 'SNAPSHOT',
        data: Array.isArray(m.data) ? (m.data as OrderBook[]) : [],
      };

    case 'ADD':
    case 'UPDATE':
      if (typeof m.symbol !== 'string' || !isMarket(m.market)) return null;
      return {
        seq: 0,
        type: m.type,
        symbol: m.symbol,
        market: m.market,
        bids: Array.isArray(m.bids) ? (m.bids as Level[]) : [],
        asks: Array.isArray(m.asks) ? (m.asks as Level[]) : [],
      };

    case 'DROP':
      if (typeof m.symbol !== 'string' || !isMarket(m.market)) return null;
      return { seq: 0, type: 'DROP', symbol: m.symbol, market: m.market };

    default:
      return null;
  }
}

// ── Flush scheduler: one store write per animation frame (plan §5, §8) ──

function scheduleFlush(): void {
  if (rafHandle !== null || hiddenTimer !== null) return; // already scheduled

  // Background tabs throttle/suspend rAF, so a hidden tab flushes on a timer instead.
  if (typeof document !== 'undefined' && document.hidden) {
    hiddenTimer = setTimeout(() => {
      hiddenTimer = null;
      flush();
    }, HIDDEN_FLUSH_MS);
  } else {
    rafHandle = requestAnimationFrame(() => {
      rafHandle = null;
      flush();
    });
  }
}

function cancelFlush(): void {
  if (rafHandle !== null) {
    cancelAnimationFrame(rafHandle);
    rafHandle = null;
  }
  if (hiddenTimer !== null) {
    clearTimeout(hiddenTimer);
    hiddenTimer = null;
  }
}

/** Drain the buffer into a SINGLE store write (one subscriber sweep for the whole burst). */
function flush(): void {
  cancelFlush();
  if (buffer.length === 0) return;
  const batch = buffer;
  buffer = [];
  const candidates = useOrderbookStore.getState().applyMessages(batch);
  // Drop repeats of a still-in-cooldown order (top-5 churn re-raises identical levels).
  const fresh = filterAnnounced(candidates);
  if (fresh.length) useNotificationStore.getState().push(fresh);
}
