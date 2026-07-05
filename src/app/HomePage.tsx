import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMe, logout } from '@/features/auth';
import { BrandMark } from '@/components/BrandMark';

/**
 * Minimal authenticated shell (placeholder). Header (BrandMark + Logout) over the
 * hydrated `/me` profile. `accessState` is displayed but NOT enforced (locked
 * decision 4); real feature surfaces (order book, rules, billing) replace this later.
 */
export function HomePage() {
  const me = useMe();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);

  async function onLogout() {
    setLoggingOut(true);
    await logout(); // best-effort POST /logout; ALWAYS clears session + evicts /me cache
    // clearSession() flips status → 'anonymous'; ProtectedRoute would redirect on the next
    // render, but navigate explicitly for an immediate, deterministic bounce.
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface text-text">
      <header className="flex items-center justify-between border-b border-border-subtle px-10 py-[22px]">
        <BrandMark />
        <button
          type="button"
          onClick={onLogout}
          disabled={loggingOut}
          className="rounded-[7px] border border-border px-4 py-[9px] text-[14px] font-medium
                     text-text-secondary transition-colors hover:bg-white/5
                     disabled:cursor-not-allowed disabled:opacity-50
                     focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {loggingOut ? 'Signing out…' : 'Log out'}
        </button>
      </header>

      <main className="flex flex-1 items-center justify-center px-8">
        {me.isSuccess && me.data ? (
          <div className="flex w-[420px] flex-col gap-2">
            <h1 className="text-[22px] font-semibold tracking-tight">
              Welcome back, {me.data.firstName}.
            </h1>
            <p className="text-[14px] text-text-secondary">{me.data.email}</p>
            <p className="text-[13px] text-text-secondary">
              Access: <span className="text-text">{me.data.accessState}</span>
              {me.data.accessExpiresAt &&
                ` · expires ${new Date(me.data.accessExpiresAt).toLocaleDateString()}`}
            </p>
            <p className="text-[13px] text-text-secondary">Foundation is up. No features yet.</p>
          </div>
        ) : (
          // Defensive: a transient /me failure (5xx/network) leaves the user authenticated but
          // profile-less; offer a retry rather than a blank screen or a wrongful logout.
          <div className="flex flex-col items-center gap-3">
            <p className="text-[14px] text-text-secondary">Couldn’t load your profile.</p>
            <button
              type="button"
              onClick={() => me.refetch()}
              className="text-[14px] font-medium text-accent"
            >
              Retry
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
