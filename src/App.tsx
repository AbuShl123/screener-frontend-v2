import { Routes, Route, Navigate } from 'react-router-dom';
import { CheckInboxPage, LoginPage, RegisterPage, VerifyEmailPage } from '@/features/auth';
import { SessionGate } from '@/app/SessionGate';
import { ProtectedRoute } from '@/app/ProtectedRoute';
import { PublicRoute } from '@/app/PublicRoute';
import { DashboardPage } from '@/features/orderbook';
import {
  AccountPage,
  CheckoutStubPage,
  ChoosePlanPage,
  PayByDaysPage,
  PaymentMethodPage,
  PaymentStatusPage,
} from '@/features/billing';
import { LandingPage } from '@/features/landing';

/**
 * Application shell. `SessionGate` gates the whole app on reload with a blocking
 * bootstrap splash while `/me` re-validates rehydrated tokens. Route guards enforce
 * auth-only policy: `ProtectedRoute` for the app, `PublicRoute` to bounce an
 * authenticated user off /login and /register. /verify-email and /register/check-inbox
 * stay reachable in any auth state (locked decision 3).
 */
export default function App() {
  return (
    <SessionGate>
      <Routes>
        {/* Public marketing home — reachable in any auth state; the page self-adapts
            (plan §10). No guard: anonymous and authenticated visitors both see it. */}
        <Route path="/" element={<LandingPage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/account"
          element={
            <ProtectedRoute>
              <AccountPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/billing/checkout"
          element={
            <ProtectedRoute>
              <CheckoutStubPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/billing/plans"
          element={
            <ProtectedRoute>
              <ChoosePlanPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/billing/pay-by-days"
          element={
            <ProtectedRoute>
              <PayByDaysPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/billing/payment"
          element={
            <ProtectedRoute>
              <PaymentMethodPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/billing/status"
          element={
            <ProtectedRoute>
              <PaymentStatusPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/login"
          element={
            <PublicRoute>
              <LoginPage />
            </PublicRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicRoute>
              <RegisterPage />
            </PublicRoute>
          }
        />
        {/* Unguarded in any auth state (locked decision 3): a logged-in user may still
            click a verify link or land on check-inbox. */}
        <Route path="/register/check-inbox" element={<CheckInboxPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </SessionGate>
  );
}
