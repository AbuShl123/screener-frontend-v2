import { MinimumTierControl } from './MinimumTierControl';
import { MutedTickers } from './MutedTickers';

/**
 * The Settings → Notifications content pane: the minimum-tier segmented control, a
 * hairline divider, then the muted-tickers block. Both children read/write
 * `useNotificationSettingsStore` directly (conventional React reads — this is a
 * CRUD-style screen, not the real-time surface).
 *
 * `open` is threaded down to `MutedTickers` so its `useTickers` fetch only fires while
 * the modal is actually open.
 */
export function NotificationsSettings({ open }: { open: boolean }) {
  return (
    <div className="flex flex-col gap-[26px]">
      <MinimumTierControl />
      <div className="h-px shrink-0 bg-border-subtle" />
      <MutedTickers open={open} />
    </div>
  );
}
