import { useEffect, useState } from 'react';

/** The current epoch ms, refreshed every `intervalMs`; stops advancing while not `running`. */
export function useNow(intervalMs: number, running = true): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, running]);
  return now;
}
