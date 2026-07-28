import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '@/lib/api';
import { useGiftEntitlement } from '../queries';
import type { GiftResult } from '../schemas';

/**
 * Gift-access dialog (design's `giftOpen` modal). Fields map 1:1 to `POST /api/admin/entitlement/
 * gift`: recipient chips (`userIds`), a digits-only "add period days" (client-validated `> 0`,
 * since the backend rejects omitted/`<=0` with 400), and an optional free-text `reason`.
 *
 * The stacking note is load-bearing copy: a gift ADDS to remaining time and reports as `TRIAL`
 * (never a paid `ACTIVE`), so the copy must not imply a paid grant. On a 404 (a stale id) the
 * whole request is rejected all-or-nothing — we surface the backend `message` inline; nobody was
 * gifted, and a users-query refresh + retry recovers.
 */
export function GiftAccessModal({
  recipients,
  onClose,
  onGifted,
}: {
  recipients: { id: string; name: string }[];
  onClose: () => void;
  onGifted: (result: GiftResult, days: number) => void;
}) {
  const { t } = useTranslation('admin');
  const gift = useGiftEntitlement();
  const [days, setDays] = useState(30);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const daysValid = Number.isFinite(days) && days > 0;
  const canConfirm = daysValid && recipients.length > 0 && !gift.isPending;

  function confirm() {
    if (!canConfirm) return;
    setError(null);
    gift.mutate(
      { userIds: recipients.map((r) => r.id), addPeriodDays: days, reason: reason.trim() || undefined },
      {
        onSuccess: (result) => onGifted(result, days),
        onError: (e) => setError(e instanceof ApiError ? e.message : String(e)),
      },
    );
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(6,8,12,0.74)] p-6 backdrop-blur-[4px]"
      onClick={onClose}
    >
      <div
        className="max-h-full w-[480px] max-w-full overflow-auto rounded-[14px] border border-border bg-surface
                   shadow-[0_24px_60px_rgba(0,0,0,0.45)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-[26px] pt-6">
          <div className="text-[19px] font-semibold tracking-[-0.01em] text-text">{t('gift.title')}</div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer px-[6px] py-1 font-mono text-[16px] leading-none text-text-dim transition-colors hover:text-text"
          >
            ×
          </button>
        </div>

        <div className="flex flex-col gap-[22px] px-[26px] pb-[26px] pt-[22px]">
          {/* Recipients */}
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-secondary">
              {t('gift.recipients')} &mdash; {t('gift.count', { count: recipients.length })}
            </div>
            <div className="mt-[10px] flex flex-wrap gap-[6px]">
              {recipients.map((r) => (
                <span
                  key={r.id}
                  className="whitespace-nowrap rounded-full border border-border-input bg-input px-[10px] py-[6px] font-mono text-[11px] text-text-secondary"
                >
                  {r.name}
                </span>
              ))}
            </div>
          </div>

          {/* Add period days */}
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-secondary">
              {t('gift.days.label')}
            </div>
            <div className="mt-[10px] flex gap-2">
              <div
                className="flex min-w-0 flex-1 items-center gap-2 rounded-[8px] border bg-input px-[14px]"
                style={{
                  borderColor: daysValid ? 'var(--color-border-input)' : 'var(--color-danger)',
                }}
              >
                <input
                  value={daysValid ? String(days) : ''}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/[^0-9]/g, '');
                    setDays(digits ? parseInt(digits, 10) : 0);
                  }}
                  inputMode="numeric"
                  autoComplete="off"
                  className="min-w-0 flex-1 border-none bg-transparent py-3 font-mono text-[16px] font-semibold text-text outline-none"
                />
                <span className="flex-none font-mono text-[11px] uppercase tracking-[0.08em] text-text-muted">
                  {t('gift.days.unit')}
                </span>
              </div>
            </div>
            {!daysValid && (
              <div className="mt-[9px] font-mono text-[11px] text-danger">{t('gift.days.hint')}</div>
            )}
          </div>

          {/* Reason */}
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-secondary">
              {t('gift.reason.label')} <span className="text-text-dim">&mdash; {t('gift.reason.optional')}</span>
            </div>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('gift.reason.placeholder')}
              className="mt-[10px] box-border w-full rounded-[8px] border border-border-input bg-input px-[14px] py-[13px]
                         font-sans text-[14px] text-text-strong outline-none"
            />
          </div>

          {/* Stacking note */}
          <div className="rounded-[10px] border border-border-subtle bg-input px-4 py-[14px] font-sans text-[13px] leading-[1.6] text-text-secondary">
            {t('gift.note')}
          </div>

          {error && (
            <div className="rounded-[8px] border border-[color-mix(in_oklab,var(--color-danger)_38%,transparent)] bg-[color-mix(in_oklab,var(--color-danger)_10%,transparent)] px-[14px] py-[11px] font-sans text-[13px] leading-[1.5] text-[#F0A2A2]">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-[8px] border border-border-input bg-transparent px-4 py-[13px] font-sans text-[14px]
                         font-medium leading-none text-text-muted outline-none transition-colors hover:text-text"
            >
              {t('gift.cancel')}
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={!canConfirm}
              className="rounded-[8px] border border-accent bg-accent px-[18px] py-[13px] font-sans text-[14px] font-semibold
                         leading-none text-accent-ink outline-none transition-[filter] duration-150 hover:brightness-110
                         disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100"
            >
              {gift.isPending
                ? t('gift.pending')
                : daysValid
                  ? t('gift.confirm', { count: days })
                  : t('gift.confirmDefault')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
