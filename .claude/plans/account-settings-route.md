# Account Page — Settings Route — Implementation Plan

Turns the disabled "Settings" item in the account sidebar into a real route,
`/account/settings`, using the `showSettings` block of the **"User Profile Account Page
Design"** Claude Design project (`Account Page.dc.html`, `div[data-screen-label="Settings"]`,
lines ~435–645) as the layout/chrome source of truth, while reusing the *existing*
`src/features/settings/components/*` (the modal's content pieces) unchanged for all the
actual functionality.

## What the design template actually shows (important — it is NOT a copy of the modal's UX)

Reading the template's markup + its `Component` class (`scrollToSection`, `onAnyScroll`,
`scrollBoxOf`, `settingsRefs`) closely: the Settings screen is **one scrollable page with both
sections always mounted**, not a click-to-swap single-pane view like `SettingsModal`:

- A page header ("Settings" + a mono subtitle).
- A **sticky tab bar** (`position: sticky; top: 0`, bleeds to the container edges via negative
  margin) with two tabs: "Classification rules" / "Notifications".
- Two **always-rendered** section cards (`ref="{{ refRules }}"` / `ref="{{ refNotifs }}"`,
  `background: var(--color-input); border: 1px solid var(--color-border); border-radius: 10px`),
  each headed by a small muted mono label, stacked vertically in normal document flow.
- Clicking a tab **smooth-scrolls** to that card (`scrollToSection`, `-62px` offset under the
  sticky bar); a `scroll` listener (`onAnyScroll`) walks up to the nearest scrollable ancestor
  and flips the active tab based on which card's top has crossed a ~90px threshold. There is no
  conditional render swapping one section out for the other.

So: **"copies the design and functionality from the modal"** resolves as — the design supplies
the page chrome (header, sticky scroll-spy tabs, card wrappers); the modal supplies the content
(`ClassificationRules`, `NotificationsSettings`, and everything under them) verbatim. Per
CLAUDE.md, the design template is the source of truth for layout/spacing/copy, so the scroll-spy
behavior is what gets built, not the modal's nav-rail tab switch.

## Locked decisions

1. **Route & ownership** — `/account/settings`, `ProtectedRoute` only (no `AdminRoute` — this is
   for every user, admin or not). New page lives in `src/features/settings/pages/SettingsPage.tsx`
   (the settings feature owns its own page and exports it from its barrel), wrapped in billing's
   shared `AccountLayout` — the same cross-feature composition already established by
   `src/features/admin/pages/{AnalyticsPage,UsersPage}.tsx`.
2. **Reuse, don't fork** — `ClassificationRules.tsx`, `NotificationsSettings.tsx`, and everything
   they compose (`RuleEditor`, `CustomRulesList`, `MinimumTierControl`, `MutedTickers`,
   `UpgradeNote`) get **zero changes**. `SettingsModal.tsx` also stays untouched — it keeps serving
   the in-dashboard overlay opened from `DashboardPage`'s header. Two entry points, one set of
   components; no duplicated CRUD/query/validation logic.
3. **Both sections always mounted** — matching the design, `SettingsPage` renders both
   `<ClassificationRules open={true} />` and `<NotificationsSettings open={true} />`
   simultaneously (not gated by which tab is "active"). `open` is the same lazy-fetch gate the
   modal uses (`enabled: open && ...` in `useDefaultRule`/`useCustomRules`/`useTickers`); on a
   routed page the component is only mounted while the route is active, so the gate is simply
   always-true. `useTickers` is called by both `ClassificationRules` and `MutedTickers` under the
   same query key (`settingsKeys.tickers`) — React Query dedupes them to a single request even
   though both are mounted at once, so there's no double-fetch concern.
4. **No page-level subscription gate.** `ClassificationRules`'s custom-rules list already
   degrades to `UpgradeNote` for an EXPIRED user (existing JSON-403 handling via
   `isSubscriptionError`); `NotificationsSettings` is client-only (localStorage) with no access
   dependency. Adding another gate around the whole page would be redundant — consistent with
   CLAUDE.md's "conventional CRUD screen, don't over-engineer" guidance for this module.
5. **Nav wiring** — in `AccountLayout`, move `'accountNav.settings'` out of `DISABLED_NAV` into
   `NAV` pointing at `/account/settings`. `'accountNav.security'` stays disabled (unrelated,
   out of scope — Security isn't built).
6. **Copy** — reuse `modal.nav.rules` / `modal.nav.notifications` verbatim for the two tab labels
   (no duplicate strings to translate). Add one new key pair for the page header only
   (`page.title` / `page.subtitle`), since the modal's `modal.title` is a small dialog header, not
   full-page hero copy — see §5 below for exact EN/RU text.
7. **Scroll-spy stays local** — the scroll-position tracking (port of `scrollBoxOf` /
   `onAnyScroll` / `scrollToSection`) is implemented as a small effect inside `SettingsPage.tsx`
   itself, not extracted into a shared hook. Nothing else in the app needs sticky scroll-spy tabs
   today, so a bespoke abstraction would be premature.

## File-by-file changes

### 1. `src/features/settings/pages/SettingsPage.tsx` (new)

Structure (mirrors `BillingHistoryPage.tsx`'s header conventions: `max-w-[1000px] p-10`,
27px/semibold title, mt-2 mono 12px dim caption — template uses `max-width:1100px` for this
screen specifically):

```tsx
<AccountLayout>
  <div className="max-w-[1100px] p-10 flex flex-col gap-5">
    {/* Header */}
    <div>
      <div className="font-sans text-[27px] font-semibold tracking-[-0.01em] text-text">
        {t('page.title')}
      </div>
      <div className="mt-2 font-mono text-[12px] text-text-dim">{t('page.subtitle')}</div>
    </div>

    {/* Sticky scroll-spy tab bar */}
    <div className="sticky top-0 z-[6] -mx-10 bg-bg px-10 pt-2">
      <div className="flex gap-1 border-b border-border-subtle">
        <TabButton label={t('modal.nav.rules')} active={activeTab === 'rules'}
                   onClick={() => scrollToSection('rules')} />
        <TabButton label={t('modal.nav.notifications')} active={activeTab === 'notifications'}
                   onClick={() => scrollToSection('notifications')} />
      </div>
    </div>

    {/* Classification rules card */}
    <div ref={rulesRef}
         className="flex flex-col gap-6 rounded-[10px] border border-border bg-input px-[26px] pt-6 pb-[26px]">
      <div className="font-mono text-[11px] tracking-[0.08em] uppercase text-text-muted">
        {t('modal.nav.rules')}
      </div>
      <ClassificationRules open={true} />
    </div>

    {/* Notifications card */}
    <div ref={notifsRef}
         className="flex flex-col gap-6 rounded-[10px] border border-border bg-input px-[26px] pt-6 pb-[26px]">
      <div className="font-mono text-[11px] tracking-[0.08em] uppercase text-text-muted">
        {t('modal.nav.notifications')}
      </div>
      <NotificationsSettings open={true} />
    </div>
  </div>
</AccountLayout>
```

`TabButton` can be a tiny local component (mono 11px uppercase, `border-bottom: 2px solid` accent
when active, muted otherwise) — same visual spec as the template's tab button, no need to reuse
`BillingHistoryPage`'s `TabButton` since that one renders a trailing count badge this design
doesn't have.

**Scroll-spy logic** (ported from the template, adapted to React refs/effects):

```tsx
const rulesRef = useRef<HTMLDivElement>(null);
const notifsRef = useRef<HTMLDivElement>(null);
const [activeTab, setActiveTab] = useState<'rules' | 'notifications'>('rules');

// Find the nearest scrollable ancestor — in practice AccountLayout's <main className="overflow-auto">.
function scrollBoxOf(el: HTMLElement | null): HTMLElement | null { /* port of template's scrollBoxOf */ }

useEffect(() => {
  const onScroll = () => {
    const n = notifsRef.current;
    if (!n) return;
    const box = scrollBoxOf(n);
    const refTop = box ? box.getBoundingClientRect().top : 0;
    const key = n.getBoundingClientRect().top - refTop <= 90 ? 'notifications' : 'rules';
    setActiveTab((cur) => (cur === key ? cur : key));
  };
  document.addEventListener('scroll', onScroll, true);
  return () => document.removeEventListener('scroll', onScroll, true);
}, []);

function scrollToSection(key: 'rules' | 'notifications') {
  setActiveTab(key);
  const el = (key === 'rules' ? rulesRef : notifsRef).current;
  if (!el) return;
  const box = scrollBoxOf(el);
  if (box) {
    const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 62;
    box.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }
}
```

Since `AccountLayout`'s `<main>` is the scroll container (`overflow-auto`, fixed `h-screen` shell),
`scrollBoxOf` will resolve to it in practice — the generic ancestor-walk is kept anyway (as the
template does) so this isn't brittle against layout tweaks.

### 2. `src/features/settings/index.ts`

Add:
```ts
export { SettingsPage } from './pages/SettingsPage';
```

### 3. `src/App.tsx`

Import `SettingsPage` from `@/features/settings` and add, alongside the other `/account/*`
routes:
```tsx
<Route
  path="/account/settings"
  element={
    <ProtectedRoute>
      <SettingsPage />
    </ProtectedRoute>
  }
/>
```

### 4. `src/features/billing/components/AccountLayout.tsx`

```diff
 const NAV: { labelKey: ParseKeys<'billing'>; path: string }[] = [
   { labelKey: 'accountNav.account', path: '/account' },
   { labelKey: 'accountNav.billingHistory', path: '/account/billing-history' },
+  { labelKey: 'accountNav.settings', path: '/account/settings' },
 ];
-const DISABLED_NAV: ParseKeys<'billing'>[] = ['accountNav.security', 'accountNav.settings'];
+const DISABLED_NAV: ParseKeys<'billing'>[] = ['accountNav.security'];
```
No other change needed — active-route highlighting already derives from `pathname === path`.

### 5. Locale files — `src/lib/i18n/locales/{en,ru}/settings.json`

Add a `page` block (new keys only; `modal.nav.*` already covers the tab labels):

EN:
```json
"page": {
  "title": "Settings",
  "subtitle": "Notification filters & classification thresholds — applied to every book you subscribe to"
}
```

RU:
```json
"page": {
  "title": "Настройки",
  "subtitle": "Фильтры уведомлений и пороги классификации — применяются ко всем книгам, на которые вы подписаны"
}
```

### 6. No changes

`ClassificationRules.tsx`, `NotificationsSettings.tsx`, `RuleEditor.tsx`, `CustomRulesList.tsx`,
`MinimumTierControl.tsx`, `MutedTickers.tsx`, `UpgradeNote.tsx`, `queries.ts`, `api.ts`,
`schemas.ts`, `notificationSettingsStore.ts`, `tickerPool.ts`, `rulesValidation.ts`,
`SettingsModal.tsx` — all untouched.

## Verification

- `npm run typecheck` (no test runner/lint configured — this plus a manual pass is the full
  verification story per CLAUDE.md).
- Manual check (no Playwright, per CLAUDE.md): navigate `/account` → click "Settings" in the
  sidebar → lands on `/account/settings`; confirm the sticky tab bar highlights correctly on
  manual scroll and jump-scrolls on tab click; confirm rule search/edit/save/revert and
  tier-select/mute/unmute all behave identically to the existing modal; confirm an EXPIRED-access
  account sees `UpgradeNote` in the custom-rules card; confirm the dashboard's existing Settings
  modal is unaffected by this change (separate entry point, same components).

## Explicitly out of scope

- **Appearance** — the design's `showSettings` block has no third section for it (only
  Classification rules + Notifications); it stays a `SOON`-chip, modal-only concept. Not part of
  this route.
- **Security** nav item — stays disabled; unrelated feature, not built yet.
