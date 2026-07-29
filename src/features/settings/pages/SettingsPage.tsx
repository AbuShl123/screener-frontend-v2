import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccountLayout } from '@/features/billing';
import { ClassificationRules } from '../components/ClassificationRules';
import { NotificationsSettings } from '../components/NotificationsSettings';

/**
 * Account → Settings routed page (`/account/settings`, behind ProtectedRoute), from the
 * "User Profile Account Page Design" `showSettings` block. Unlike `SettingsModal`'s
 * click-to-swap nav rail, the design is **one scrollable page with both sections always
 * mounted**: a sticky scroll-spy tab bar jump-scrolls to — and highlights — the section
 * currently in view.
 *
 * The chrome (header, sticky tabs, card wrappers) comes from the design; the content is the
 * existing modal panes reused verbatim (`ClassificationRules` / `NotificationsSettings`,
 * `open={true}` since a routed page is only mounted while active — plan §2/§3). No
 * page-level access gate: the custom-rules list self-degrades to `UpgradeNote` for an
 * EXPIRED user and notification prefs are client-only (plan §4).
 */

type Section = 'rules' | 'notifications';

export function SettingsPage() {
  const { t } = useTranslation('settings');
  const rulesRef = useRef<HTMLDivElement>(null);
  const notifsRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<Section>('rules');

  // Scroll-spy: on any scroll (capture, so it catches the nearest scrollable ancestor —
  // AccountLayout's <main className="overflow-auto">), flip the active tab based on whether
  // the Notifications card's top has crossed a ~90px threshold under the sticky bar. Ported
  // from the template's onAnyScroll/scrollBoxOf.
  useEffect(() => {
    const onScroll = () => {
      const n = notifsRef.current;
      if (!n) return;
      const box = scrollBoxOf(n);
      const refTop = box ? box.getBoundingClientRect().top : 0;
      const key: Section = n.getBoundingClientRect().top - refTop <= 90 ? 'notifications' : 'rules';
      setActiveTab((cur) => (cur === key ? cur : key));
    };
    document.addEventListener('scroll', onScroll, true);
    return () => document.removeEventListener('scroll', onScroll, true);
  }, []);

  function scrollToSection(key: Section) {
    setActiveTab(key);
    const el = (key === 'rules' ? rulesRef : notifsRef).current;
    if (!el) return;
    const box = scrollBoxOf(el);
    if (box) {
      const top =
        el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 62;
      box.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    } else {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  return (
    <AccountLayout>
      <div className="flex max-w-[1100px] flex-col gap-5 p-10">
        {/* Header */}
        <div>
          <div className="font-sans text-[27px] font-semibold tracking-[-0.01em] text-text">
            {t('page.title')}
          </div>
          <div className="mt-2 font-mono text-[12px] text-text-dim">{t('page.subtitle')}</div>
        </div>

        {/* Sticky scroll-spy tab bar (bleeds to the container edges via negative margin) */}
        <div className="sticky top-0 z-[6] -mx-10 -mt-2 bg-bg px-10 pt-2">
          <div className="flex gap-1 border-b border-border-subtle">
            <TabButton
              label={t('modal.nav.rules')}
              active={activeTab === 'rules'}
              onClick={() => scrollToSection('rules')}
            />
            <TabButton
              label={t('modal.nav.notifications')}
              active={activeTab === 'notifications'}
              onClick={() => scrollToSection('notifications')}
            />
          </div>
        </div>

        {/* Classification rules card */}
        <div
          ref={rulesRef}
          className="flex flex-col gap-6 rounded-[10px] border border-border bg-input px-[26px] pb-[26px] pt-6"
        >
          <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-muted">
            {t('modal.nav.rules')}
          </div>
          {/*
            The reused settings components were built to the modal's "raised" depth scheme
            (bg-input insets over a bg-surface dialog). The Account Page design template
            inverts it: insets sit at --color-bg (recessed) and the rule editor's number
            fields at --color-input. That's an exact swap of the two tokens, so we remap
            them for the card *contents* only — the card's own bg-input (the lightest layer)
            stays outside this wrapper. Literal values are required: a var()-based swap would
            be self-referential. The modal renders the same components without this wrapper,
            so its appearance is unchanged.
          */}
          <div className="[--color-bg:#0d1219] [--color-input:#06080c]">
            <ClassificationRules open={true} />
          </div>
        </div>

        {/* Notifications card */}
        <div
          ref={notifsRef}
          className="flex flex-col gap-6 rounded-[10px] border border-border bg-input px-[26px] pb-[26px] pt-6"
        >
          <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-muted">
            {t('modal.nav.notifications')}
          </div>
          {/* Same token swap as the rules card above — see that comment for the rationale. */}
          <div className="[--color-bg:#0d1219] [--color-input:#06080c]">
            <NotificationsSettings open={true} />
          </div>
        </div>
      </div>
    </AccountLayout>
  );
}

/**
 * Sticky-bar tab: mono 11px uppercase, a 2px accent underline when active, muted→text on
 * hover otherwise. Same visual spec as the template's tab button (no count badge, unlike
 * `BillingHistoryPage`'s TabButton — so a separate local component).
 */
function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-mb-px border-b-2 px-[14px] py-[11px] font-mono text-[11px] uppercase tracking-[0.08em] transition-colors duration-150 hover:text-text"
      style={{
        borderColor: active ? 'var(--color-accent)' : 'transparent',
        color: active ? 'var(--color-text)' : 'var(--color-text-muted)',
      }}
    >
      {label}
    </button>
  );
}

/** Nearest scrollable ancestor of `el` (port of the template's scrollBoxOf). */
function scrollBoxOf(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}
