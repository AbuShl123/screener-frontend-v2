import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useNavigate, type NavigateFunction } from 'react-router-dom';
import { Button } from '@/components/Button';
import { AccountLayout } from '../components/AccountLayout';
import {
  PLAN,
  SOURCE,
  STATUS,
  buildTimeline,
  days,
  fmtAmount,
  fmtDate,
  tint,
} from '../historyView';
import { useCancelOrder, useEntitlementHistory, useOrderHistory, useOrders } from '../queries';
import type { EntitlementLedgerEntry, OrderDetails } from '../schemas';

type Tab = 'payments' | 'grants';
type CopyFn = (key: string, text: string) => void;

/**
 * Billing history (`/account/billing-history`, behind ProtectedRoute), from the "Billing
 * History" design template. Two tabs over the user's own billing records:
 *  - **Payments** (`GET /api/billing/orders`) — the full order audit trail, each row expandable
 *    to lazy-load (`GET /orders/{id}/history`) a status-transition timeline + order details.
 *  - **Access grants** (`GET /api/billing/entitlement/history`) — the entitlement ledger, the
 *    events that actually pushed access forward (trial / paid / admin).
 *
 * Conventional CRUD screen (CLAUDE.md): TanStack Query for server state, ordinary React state
 * for tab / expand / copied. The design's PLAN/STATUS/REASON/SOURCE maps + formatters are
 * ported into `historyView.ts`; this component just wires them to the fetched data.
 */
export function BillingHistoryPage() {
  const navigate = useNavigate();
  const orders = useOrders();
  const ledger = useEntitlementHistory();
  const cancelOrder = useCancelOrder();

  const [tab, setTab] = useState<Tab>('payments');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const copyTimer = useRef<number | undefined>(undefined);

  const orderList = orders.data ?? [];
  const ledgerList = ledger.data ?? [];

  const copy = useCallback<CopyFn>((key, text) => {
    try {
      navigator.clipboard?.writeText(text);
    } catch {
      // clipboard unavailable (insecure origin / denied) — the label just won't flip
    }
    setCopied(key);
    window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(null), 1400);
  }, []);

  const toggle = (id: string) => setExpanded((s) => ({ ...s, [id]: !s[id] }));
  const viewOrder = (id: string) => {
    setTab('payments');
    setExpanded((s) => ({ ...s, [id]: true }));
  };

  // "Access through" reads the newest ledger row's newExpiresAt, matching the design (the ledger
  // is what it renders — should agree with /me's accessExpiresAt).
  const accessThrough = ledgerList.length ? fmtDate(ledgerList[0].newExpiresAt) : '—';
  const grantsWord = ledgerList.length === 1 ? 'grant' : 'grants';
  const headerCaption = `${orderList.length} orders · ${ledgerList.length} ${grantsWord} · access through ${accessThrough}`;

  return (
    <AccountLayout>
      <div className="max-w-[1000px] p-10">
        <div className="font-sans text-[27px] font-semibold tracking-[-0.01em] text-text">
          Billing history
        </div>
        <div className="mt-2 font-mono text-[12px] text-text-dim">{headerCaption}</div>

        {/* ===== Tabs ===== */}
        <div className="mt-7 flex items-center gap-7 border-b border-border-subtle">
          <TabButton
            label="Payments"
            count={orderList.length}
            active={tab === 'payments'}
            onClick={() => setTab('payments')}
          />
          <TabButton
            label="Access grants"
            count={ledgerList.length}
            active={tab === 'grants'}
            onClick={() => setTab('grants')}
          />
        </div>

        {tab === 'payments' ? (
          <div className="mt-1">
            {!orders.isLoading && orderList.length === 0 ? (
              <PaymentsEmpty onChoosePlan={() => navigate('/billing/plans')} />
            ) : (
              <div>
                <div className="grid grid-cols-[128px_1fr_132px_104px_28px] gap-4 border-b border-border-subtle px-4 py-[14px]">
                  <HeaderCell>Status</HeaderCell>
                  <HeaderCell>Plan</HeaderCell>
                  <HeaderCell align="right">Amount</HeaderCell>
                  <HeaderCell align="right">Date</HeaderCell>
                  <span />
                </div>
                {orderList.map((order) => (
                  <OrderRow
                    key={order.orderId}
                    order={order}
                    expanded={!!expanded[order.orderId]}
                    onToggle={() => toggle(order.orderId)}
                    copied={copied}
                    onCopy={copy}
                    cancelOrder={cancelOrder}
                    navigate={navigate}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-1">
            <div className="grid grid-cols-[104px_128px_1fr_116px_152px] gap-4 border-b border-border-subtle px-4 py-[14px]">
              <HeaderCell>Date</HeaderCell>
              <HeaderCell>Source</HeaderCell>
              <HeaderCell>Grant</HeaderCell>
              <HeaderCell align="right">Added</HeaderCell>
              <HeaderCell align="right">Access through</HeaderCell>
            </div>
            {ledgerList.map((g, i) => (
              <GrantRow key={`${g.source}:${g.createdAt}:${i}`} grant={g} onViewOrder={viewOrder} />
            ))}
            <div className="mt-4 font-mono text-[11px] leading-[1.6] text-text-dim">
              Only successful grants appear here — trials, paid purchases and admin credits. Failed
              or expired orders never grant access, so they live under Payments.
            </div>
          </div>
        )}
      </div>
    </AccountLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tabs / header cells
// ─────────────────────────────────────────────────────────────────────────────

function TabButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-mb-px flex items-center gap-2 border-b-2 pb-[13px] font-sans text-[14px] font-medium transition-colors duration-150"
      style={{
        borderColor: active ? 'var(--color-accent)' : 'transparent',
        color: active ? 'var(--color-text)' : 'var(--color-text-muted)',
      }}
    >
      {label} <span className="font-mono text-[11px] text-text-dim">({count})</span>
    </button>
  );
}

function HeaderCell({
  children,
  align = 'left',
}: {
  children: ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <span
      className={`font-mono text-[11px] uppercase tracking-[0.08em] text-text-muted ${
        align === 'right' ? 'text-right' : ''
      }`}
    >
      {children}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Payments — order rows
// ─────────────────────────────────────────────────────────────────────────────

function OrderRow({
  order,
  expanded,
  onToggle,
  copied,
  onCopy,
  cancelOrder,
  navigate,
}: {
  order: OrderDetails;
  expanded: boolean;
  onToggle: () => void;
  copied: string | null;
  onCopy: CopyFn;
  cancelOrder: ReturnType<typeof useCancelOrder>;
  navigate: NavigateFunction;
}) {
  // Lazy: history only fetches once the row is first expanded (`enabled`), then stays cached.
  const history = useOrderHistory(order.orderId, expanded);

  const meta = STATUS[order.status];
  const isOpen = order.status === 'CREATED' || order.status === 'PENDING';
  const isPaid = order.status === 'PAID';

  return (
    <div
      className="border-b border-border-subtle"
      style={{
        borderLeft: `2px solid ${isOpen ? 'var(--color-accent)' : 'transparent'}`,
        background: isOpen ? tint('var(--color-accent)', 5) : 'transparent',
      }}
    >
      <div
        onClick={onToggle}
        className="grid cursor-pointer grid-cols-[128px_1fr_132px_104px_28px] items-center gap-4 px-4 py-[15px] transition-colors hover:bg-white/[0.02]"
      >
        <div className="flex items-center gap-[7px]">
          <span className="h-[6px] w-[6px] flex-none rounded-full" style={{ background: meta.color }} />
          <span className="whitespace-nowrap font-mono text-[12px] font-medium uppercase tracking-[0.04em] text-text">
            {meta.label}
          </span>
        </div>
        <div className="min-w-0">
          <div className="font-sans text-[14px] font-medium text-text">
            {PLAN[order.planCode] ?? order.planCode}
          </div>
        </div>
        <span className="whitespace-nowrap text-right font-mono text-[14px] text-text-strong">
          {fmtAmount(order.amount, order.currency)}
        </span>
        <span className="text-right font-mono text-[13px] text-text-secondary">
          {fmtDate(order.createdAt)}
        </span>
        <div
          className="flex justify-center text-text-dim transition-transform duration-150"
          style={{ transform: `rotate(${expanded ? 180 : 0}deg)` }}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>

      {expanded && (
        <div className="flex flex-wrap gap-8 px-4 pb-6 pt-[6px]">
          {/* Left — order details + actions */}
          <div className="max-w-full flex-[0_0_320px]">
            <div className="px-[2px]">
              <DetailRow label="Order ID">
                <CopyButton
                  copied={copied === `${order.orderId}:id`}
                  label={`${order.orderId.slice(0, 8)}…`}
                  onClick={() => onCopy(`${order.orderId}:id`, order.orderId)}
                />
              </DetailRow>
              <DetailRow label="Provider">
                <span className="font-mono text-[12px] text-text-strong">{order.provider}</span>
              </DetailRow>
              <DetailRow label="Provider ref">
                {order.providerUuid ? (
                  <CopyButton
                    copied={copied === `${order.orderId}:ref`}
                    label={`${order.providerUuid.slice(0, 8)}…`}
                    onClick={() => onCopy(`${order.orderId}:ref`, order.providerUuid!)}
                  />
                ) : (
                  <span className="font-mono text-[12px] text-text-dim">—</span>
                )}
              </DetailRow>
              <DetailRow label="Access bought">
                <span className="font-mono text-[12px] text-text-strong">
                  {days(order.accessDurationSeconds)} days
                </span>
              </DetailRow>

              <div className="flex flex-wrap gap-2 pt-[14px]">
                {isOpen && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        if (order.checkoutUrl) window.location.assign(order.checkoutUrl);
                        else navigate('/billing/plans');
                      }}
                      className="flex-none whitespace-nowrap rounded-[8px] border border-border-input bg-text-muted px-4 py-[11px] font-sans text-[14px] font-medium leading-none text-bg outline-none transition-[filter] duration-150 hover:brightness-110"
                    >
                      Complete payment
                    </button>
                    <button
                      type="button"
                      onClick={() => cancelOrder.mutate()}
                      disabled={cancelOrder.isPending}
                      className="flex-none whitespace-nowrap rounded-[8px] border border-border-input bg-transparent px-4 py-[11px] font-sans text-[14px] font-medium leading-none text-text-muted outline-none transition-colors duration-150 hover:bg-text-muted/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {cancelOrder.isPending ? 'Cancelling…' : 'Cancel order'}
                    </button>
                  </>
                )}
                {isPaid && (
                  <button
                    type="button"
                    disabled
                    title="Coming soon"
                    className="inline-flex flex-none cursor-not-allowed items-center gap-2 whitespace-nowrap rounded-[8px] border border-border-input bg-transparent px-4 py-[11px] font-sans text-[14px] leading-none text-text-muted opacity-50 outline-none"
                  >
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="flex-none"
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Download receipt
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right — status-transition timeline (lazy) */}
          <div className="min-w-0 flex-[1_1_300px]">
            <div className="mb-4 text-right font-mono text-[11px] uppercase tracking-[0.08em] text-text-muted">
              Status history
            </div>
            <div className="border-r border-border pr-[22px]">
              {history.isLoading ? (
                <div className="py-1 text-right font-mono text-[12px] text-text-dim">Loading…</div>
              ) : history.isError ? (
                <div className="py-1 text-right font-mono text-[12px] text-text-dim">
                  Couldn’t load status history.
                </div>
              ) : (
                buildTimeline(history.data ?? []).map((h) => (
                  <div key={h.key} className="relative pb-4 text-right">
                    <span
                      className="absolute -right-[27px] top-[2px] h-[9px] w-[9px] rounded-full border-2 border-bg"
                      style={{ background: h.dotColor }}
                    />
                    <div className="flex flex-wrap items-baseline justify-end gap-[10px]">
                      <span className="font-mono text-[11px] text-text-dim">{h.timeStr}</span>
                      <span className="font-sans text-[13px] font-medium text-text">{h.toLabel}</span>
                    </div>
                    {h.reasonLine && (
                      <div className="mt-[3px] font-mono text-[12px] text-text-secondary">
                        {h.reasonLine}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-[47px] py-2">
      <span className="flex-[0_0_96px] font-sans text-[13px] text-text-muted">{label}</span>
      {children}
    </div>
  );
}

function CopyButton({
  copied,
  label,
  onClick,
}: {
  copied: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-[7px] border-none bg-transparent p-0 font-mono text-[12px] text-text-strong transition-colors hover:text-accent"
    >
      {copied ? 'Copied' : label}
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="flex-none"
      >
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
    </button>
  );
}

function PaymentsEmpty({ onChoosePlan }: { onChoosePlan: () => void }) {
  return (
    <div className="mt-8 rounded-[10px] border border-dashed border-border px-8 py-14 text-center">
      <div className="font-sans text-[16px] font-semibold text-text">No payments yet</div>
      <p className="mx-auto mt-[10px] max-w-[380px] font-sans text-[14px] leading-[1.6] text-text-secondary">
        You haven’t made any payment attempts. When you subscribe or top up, every order shows up
        here — paid, pending or failed.
      </p>
      <div className="mt-5 inline-flex">
        <Button variant="primary" fullWidth={false} onClick={onChoosePlan}>
          Choose a plan
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Access grants — ledger rows
// ─────────────────────────────────────────────────────────────────────────────

function GrantRow({
  grant,
  onViewOrder,
}: {
  grant: EntitlementLedgerEntry;
  onViewOrder: (orderId: string) => void;
}) {
  const meta = SOURCE[grant.source] ?? { label: grant.source, color: 'var(--color-text-muted)' };

  let title: string;
  let sub: string;
  if (grant.source === 'PURCHASE' && grant.order) {
    title = `${PLAN[grant.order.planCode] ?? grant.order.planCode} purchase`;
    sub = fmtAmount(grant.order.amount, grant.order.currency);
  } else if (grant.source === 'TRIAL') {
    title = 'Free trial started';
    sub = grant.reason ?? 'Seeded on registration';
  } else if (grant.source === 'ADMIN') {
    title = 'Admin credit granted';
    sub = grant.reason ?? '';
  } else {
    title = meta.label;
    sub = grant.reason ?? '';
  }
  const order = grant.source === 'PURCHASE' ? grant.order : null;

  return (
    <div className="grid grid-cols-[104px_128px_1fr_116px_152px] items-center gap-4 border-b border-border-subtle px-4 py-4">
      <span className="font-mono text-[13px] text-text-secondary">{fmtDate(grant.createdAt)}</span>
      <div>
        <span
          className="inline-flex items-center gap-[7px] whitespace-nowrap rounded-full border px-[11px] py-[5px] font-mono text-[11px] uppercase tracking-[0.06em]"
          style={{
            color: meta.color,
            borderColor: tint(meta.color, 35),
            background: tint(meta.color, 10),
          }}
        >
          {meta.label}
        </span>
      </div>
      <div className="min-w-0">
        <div className="font-sans text-[14px] font-medium text-text">{title}</div>
        <div className="mt-[3px] flex flex-wrap items-center gap-[10px]">
          <span className="font-mono text-[11px] text-text-dim">{sub}</span>
          {order && (
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                onViewOrder(order.orderId);
              }}
              className="font-mono text-[11px] text-accent transition-[filter] hover:brightness-110"
            >
              View order →
            </a>
          )}
        </div>
      </div>
      <span className="whitespace-nowrap text-right font-mono text-[14px] font-medium text-bid">
        +{days(grant.grantedDurationSeconds)} days
      </span>
      <div className="text-right">
        <div className="whitespace-nowrap font-mono text-[14px] text-text-strong">
          {fmtDate(grant.newExpiresAt)}
        </div>
        {grant.previousExpiresAt && (
          <div className="mt-[3px] font-mono text-[11px] text-text-dim">
            was {fmtDate(grant.previousExpiresAt)}
          </div>
        )}
      </div>
    </div>
  );
}
