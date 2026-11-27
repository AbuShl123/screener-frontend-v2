import { injectRawMessage } from '@/lib/ws/feedClient';

/**
 * DEV-ONLY mock harness for `PRICE_SPIKE` / `VOLUME_SPIKE` messages (doc §3.10). Real spikes are
 * rare (a 5% move in 5 minutes), so this builds frames exactly as the server sends them and
 * pushes them through the feed client's real parse → guard → flush path. Loaded only by the
 * serve-only `devMocks` plugin in `vite.config.ts`; nothing in `src/` may import it.
 *
 * From the browser console on the dashboard: `__spikeMock.pump()`, `.dump()`, `.volume()`,
 * `.volumeFromZero()`, `.malformed()`, or `.demo()` for the valid ones in sequence.
 */

const PEPE = { exchange: 'BINANCE', market: 'FUTURES', symbol: '1000PEPEUSDT' } as const;
const SOL = { exchange: 'BINANCE', market: 'FUTURES', symbol: 'SOLUSDT' } as const;
type Instrument = typeof PEPE | typeof SOL;

const DEMO_STEP_MS = 2_000;
let n = 0;

const send = (frame: unknown): void => injectRawMessage(JSON.stringify(frame));

function price(inst: Instrument, pct: number, fromPrice: number) {
  const time = Date.now() + n++;
  const toPrice = Number((fromPrice * (1 + pct / 100)).toPrecision(6));
  return {
    type: 'PRICE_SPIKE',
    ...inst,
    data: {
      id: `BINANCE_FUTURES:${inst.symbol}:PRICE:${time}`,
      time,
      direction: pct >= 0 ? 'UP' : 'DOWN',
      pct,
      fromPrice,
      toPrice,
      windowSec: 300,
    },
  };
}

function volume(inst: Instrument, prevVolume: number, current: number) {
  const time = Date.now() + n++;
  return {
    type: 'VOLUME_SPIKE',
    ...inst,
    data: {
      id: `BINANCE_FUTURES:${inst.symbol}:VOLUME:${time}`,
      time,
      pct: prevVolume > 0 ? Math.round(((current - prevVolume) / prevVolume) * 10_000) / 100 : null,
      prevVolume,
      volume: current,
      windowSec: 300,
    },
  };
}

const spikeMock = {
  pump: () => send(price(PEPE, 6.34, 0.01012)),
  dump: () => send(price(SOL, -7.12, 182.45)),
  volume: () => send(volume(PEPE, 40_000, 126_001.56)),
  volumeFromZero: () => send(volume(SOL, 0, 95_000)),
  /** Unusable payloads: must be ignored without throwing. */
  malformed: () => {
    for (const data of [undefined, {}, { id: 'x', time: 1, windowSec: 300, direction: 'SIDEWAYS', pct: 1 }]) {
      send({ type: 'PRICE_SPIKE', ...PEPE, data });
    }
  },
  demo: () => {
    const { pump, dump, volume: vol, volumeFromZero } = spikeMock;
    [pump, dump, vol, volumeFromZero].forEach((step, i) => setTimeout(step, i * DEMO_STEP_MS));
  },
};

declare global {
  interface Window {
    __spikeMock?: typeof spikeMock;
  }
}

window.__spikeMock = spikeMock;
