import { useCallback, useEffect, useState } from 'react';

/**
 * Reusable cosmetic countdown timer for resend buttons. Purely client-side: the
 * backend gives no cooldown signal (resend always 202), so this only prevents
 * spam-clicking and sets user expectations — it is never a source of truth.
 *
 * Reused across the post-register check-inbox screen (Phase 3), the verify-page
 * expired/invalid resend (Phase 4), and the login-403 resend (Phase 5).
 *
 * No persistence across reloads — a refresh clears it, which is fine since the
 * server enforces the real 60s throttle regardless.
 */
export function useCooldown(seconds: number) {
  const [remaining, setRemaining] = useState(0);

  const start = useCallback(() => setRemaining(seconds), [seconds]);

  useEffect(() => {
    if (remaining <= 0) return;
    const id = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(id);
  }, [remaining]);

  return { remaining, active: remaining > 0, start };
}
