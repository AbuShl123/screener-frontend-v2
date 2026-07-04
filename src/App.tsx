import { Routes, Route, Navigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import { CenteredAuthLayout } from '@/components/layouts/CenteredAuthLayout';
import { CheckInboxPage, RegisterPage } from '@/features/auth';

/**
 * Application shell. Feature routes get mounted here as they are built
 * (auth, order book, rules, billing). For now it is an intentionally empty
 * foundation with a single placeholder route.
 */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Placeholder />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/register/check-inbox" element={<CheckInboxPage />} />
      <Route path="/dev/centered-preview" element={<CenteredPreview />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function CenteredPreview() {
  return (
    <CenteredAuthLayout>
      <div className="flex flex-col items-center gap-6 text-center">
        <div
          className="flex h-[60px] w-[60px] items-center justify-center rounded-full font-mono text-[23px] text-accent"
          style={{
            border: '1px solid color-mix(in oklab, var(--color-accent) 45%, transparent)',
            background: 'color-mix(in oklab, var(--color-accent) 10%, transparent)',
          }}
        >
          @
        </div>
        <div className="flex flex-col gap-[10px]">
          <h1 className="text-[28px] font-semibold tracking-[-0.01em] text-text">Check your inbox</h1>
          <p className="text-[14px] leading-[1.6] text-text-secondary">
            We sent a verification link to
            <br />
            <strong className="font-medium text-text-strong">ada@example.com</strong>
            <br />
            The link is valid for 24 hours.
          </p>
        </div>
        <div className="flex w-full flex-col items-center gap-2">
          <Button variant="outline" fullWidth={false} className="px-5 py-[11px]">
            Didn&apos;t get it? Resend
          </Button>
          <span className="font-mono text-[11px] text-text-dim">resend available once per 60 s</span>
        </div>
        <a href="/register" className="text-[14px] text-text-secondary no-underline">
          Back to sign in
        </a>
      </div>
    </CenteredAuthLayout>
  );
}

function Placeholder() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-neutral-950 text-neutral-100">
      <h1 className="text-2xl font-semibold tracking-tight">Screener</h1>
      <p className="text-sm text-neutral-400">Foundation is up. No features yet.</p>
    </div>
  );
}
