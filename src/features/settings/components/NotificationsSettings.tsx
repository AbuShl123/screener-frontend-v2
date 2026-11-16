import { MinimumTierControl } from './MinimumTierControl';
import { MutedTickers } from './MutedTickers';
import { MutedVenues } from './MutedVenues';

/**
 * The Settings → Notifications content pane: the minimum-tier segmented control, the
 * muted-tickers block, then the muted-exchanges block, separated by hairline dividers. All
 * children read/write
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
      <div className="h-px shrink-0 bg-border-subtle" />
      <MutedVenues />
    </div>
  );
}
