// Public surface of the settings feature (barrel — nothing outside reaches internals).

// The Settings overlay, rendered by DashboardPage.
export { SettingsModal } from './components/SettingsModal';

// The routed Settings page (`/account/settings`), rendered inside billing's AccountLayout.
export { SettingsPage } from './pages/SettingsPage';

// The framework-agnostic notification-settings store — imported by `feedClient` to read
// minTier + muted synchronously on the flush hot path.
export { useNotificationSettingsStore } from './notificationSettingsStore';
