import { Routes, Route, Navigate } from 'react-router-dom';
import { CheckInboxPage, RegisterPage, VerifyEmailPage } from '@/features/auth';

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
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
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
