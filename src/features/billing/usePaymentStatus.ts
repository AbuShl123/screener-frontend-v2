import { useEffect, useRef, useState } from 'react';
import { queryClient } from '@/lib/queryClient';
import { authKeys } from '@/features/auth';
import { useCurrentOrder } from './queries';
import type { OrderDetails } from './schemas';

/**
 * The return_url status state machine (plan §2). A **conventional screen** per CLAUDE.md —
 * ordinary React state + effects, NOT the orderbook's outside-React pattern — that turns the
 * `orders/current` poll into a single discriminated view model, keeping all timing/polling
 * out of the JSX.
 *
 * Never treats the browser landing here as proof of payment: the outcome is reconstructed
 * purely by polling `orders/current` (monetization-api.md §5). The order is resolved exactly
 * once (`settled` guards against double-resolution / StrictMode double-mount).
 */

/** Loading-floor before a result is allowed to render (no-flicker on a first-poll-terminal). */
const FLOOR_MS = 3000;
/** Give up on a steady `PENDING` after this and settle as the `timeout` failure. */
const TIMEOUT_SEC = 90;
/** Below this much remaining floor a settle just snaps to 100 — no room for a staged fill. */
const STAGED_FILL_MIN_MS = 700;

/** The decided outcome. `success` unlocks; the rest are failure variants with distinct copy. */
export type Resolution =
  | { kind: 'success' }
  | { kind: 'timeout' } // 90s elapsed while still PENDING — resumable
  | { kind: 'declined' } // FAILED / CANCELED
  | { kind: 'refunded' } // REVERTED — access is kept (monetization-api.md §3)
  | { kind: 'notfound' }; // EXPIRED, a 404 (no order), or a bubbled query error

export interface PaymentStatusView {
  /** `loading` = confirming screen; `result` = resolved outcome revealed (past the floor). */
  phase: 'loading' | 'result';
  resolution: Resolution | null;
  /** The polled order (`null` on a 404 / no order). Drives the order "well" rows. */
  order: OrderDetails | null;
  /** Confirming progress bar width, 0–100. */
  progressPct: number;
  /** CSS transition duration for the current bar move, ms. */
  progressTransitionMs: number;
  /** CSS timing function for the current bar move (linear creep vs. eased fill sections). */
  progressEasing: string;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

interface FillState {
  pct: number;
  transitionMs: number;
}

/**
 * Build a staged fill from `startPct`→100 across `durationMs`. Instead of one smooth glide,
 * the bar moves in uneven sections — a quick initial jump, an ease-up, a stall/slow crawl, a
 * fast burst, another slow stretch, then a jump to full — so a first-poll-terminal reads like
 * a real confirmation settling rather than a scripted slide. Each entry is scheduled at `atMs`
 * from settle and applies a width move over its own `transitionMs`. Timing fractions are fixed
 * (so moves never fire out of order); the target %s and durations get mild per-run jitter.
 */
function buildFillScript(startPct: number, durationMs: number): { atMs: number; fill: FillState }[] {
  const span = 100 - startPct;
  const jitter = (base: number, amt: number) => base + (Math.random() - 0.5) * 2 * amt;
  // [fraction of duration when the move STARTS, fraction of the remaining span reached, transition ms]
  const checkpoints: [number, number, number][] = [
    [0.0, 0.2, 190], // quick initial jump
    [0.15, 0.4, 300], // ease up
    [0.31, 0.47, 520], // stall / slow crawl
    [0.47, 0.68, 160], // fast burst
    [0.61, 0.75, 470], // slow stretch
    [0.79, 0.92, 200], // jump
    [1.0, 1.0, 260], // land at full as the floor ends
  ];
  return checkpoints.map(([frac, portion, transMs], i) => {
    const isLast = i === checkpoints.length - 1;
    const pct = isLast
      ? 100
      : Math.round(clamp(startPct + portion * span + jitter(0, 3), startPct, 99));
    return {
      atMs: Math.round(frac * durationMs),
      fill: { pct, transitionMs: Math.round(jitter(transMs, 40)) },
    };
  });
}

export function usePaymentStatus(): PaymentStatusView {
  const mountRef = useRef(Date.now());
  const [elapsedSec, setElapsedSec] = useState(0);
  const elapsedRef = useRef(0);
  const [settled, setSettled] = useState<Resolution | null>(null);
  const [revealed, setRevealed] = useState(false);
  // Non-null once a settle kicks off the fill-to-100; drives the bar in place of the creep.
  const [fill, setFill] = useState<FillState | null>(null);

  // Poll `orders/current` until we decide an outcome; `enabled=false` after settle stops it
  // entirely (the query's own refetchInterval also halts on any terminal status / null).
  const query = useCurrentOrder(settled === null);

  // 1s ticker — drives the creep bar and the 90s deadline. Stops once settled. `elapsedRef`
  // mirrors it so the settle/fill effects can read the current value without depending on it.
  useEffect(() => {
    if (settled) return;
    const id = setInterval(() => {
      setElapsedSec((e) => {
        elapsedRef.current = e + 1;
        return e + 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [settled]);

  // Reveal the result no earlier than the loading floor (so a first-poll-terminal doesn't
  // flash). Fires once; a normal (slow) settle is already past the floor when it lands.
  useEffect(() => {
    const delay = Math.max(0, FLOOR_MS - (Date.now() - mountRef.current));
    const t = setTimeout(() => setRevealed(true), delay);
    return () => clearTimeout(t);
  }, []);

  // Resolution mapping (plan §2, precedence top-down — terminal data wins over the 90s check).
  useEffect(() => {
    if (settled) return;
    const data = query.data;
    const status = data?.status;
    let res: Resolution | null = null;
    if (status === 'PAID') res = { kind: 'success' };
    else if (status === 'FAILED' || status === 'CANCELED') res = { kind: 'declined' };
    else if (status === 'REVERTED') res = { kind: 'refunded' };
    else if (status === 'EXPIRED') res = { kind: 'notfound' };
    else if (data === null) res = { kind: 'notfound' }; // 404 — no order
    else if (query.isError) res = { kind: 'notfound' }; // persistent auth/transport fault
    else if (elapsedSec >= TIMEOUT_SEC) res = { kind: 'timeout' };
    if (!res) return;

    setSettled(res);
    if (res.kind === 'success') {
      // Refetch /me so the freshly-extended accessExpiresAt lands for the "Access until" row.
      queryClient.invalidateQueries({ queryKey: authKeys.me });
    }
  }, [settled, query.data, query.isError, elapsedSec]);

  // Drive the bar to 100% once settled. If there's real floor time left (a first-poll-terminal),
  // play the staged, uneven fill across it; otherwise just snap to full quickly.
  useEffect(() => {
    if (!settled) return;
    const remaining = Math.max(0, FLOOR_MS - (Date.now() - mountRef.current));
    const startPct = Math.min(90, (elapsedRef.current / TIMEOUT_SEC) * 100);

    if (remaining < STAGED_FILL_MIN_MS) {
      setFill({ pct: 100, transitionMs: clamp(remaining, 250, STAGED_FILL_MIN_MS) });
      return;
    }

    const script = buildFillScript(startPct, remaining);
    const timers = script.map(({ atMs, fill: f }) => setTimeout(() => setFill(f), atMs));
    return () => timers.forEach(clearTimeout);
  }, [settled]);

  const phase: PaymentStatusView['phase'] = settled && revealed ? 'result' : 'loading';

  // Steady PENDING: linear creep capped at 90% (headroom for the fill). Settled: the staged
  // fill state takes over with eased section moves.
  const progressPct = fill ? fill.pct : Math.min(90, (elapsedSec / TIMEOUT_SEC) * 100);
  const progressTransitionMs = fill ? fill.transitionMs : 900;
  const progressEasing = fill ? 'ease-out' : 'linear';

  return {
    phase,
    resolution: settled,
    order: query.data ?? null,
    progressPct,
    progressTransitionMs,
    progressEasing,
  };
}
