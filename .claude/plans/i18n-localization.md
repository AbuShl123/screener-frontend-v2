# Plan: Internationalization (i18n) — English + Russian

> Status: proposed (not yet implemented). Written 2026-07-12.
>
> This is a **design-decision + inventory** document, not an implementation. Its two jobs:
> 1. Lock the localization strategy and conventions so extraction — likely done feature-by-feature
>    across several sessions — stays consistent and doesn't drift between screens.
> 2. Catalogue every place in the current codebase that holds user-facing English, so the scope of
>    "make the app bilingual" is known before a single string is moved.
>
> Sources of truth used while writing this: a full sweep of `src/**/*.{ts,tsx}`, CLAUDE.md (the
> config-via-`env.ts` rule, the feature-module + barrel-export conventions, the data-flow split), and
> the observation that **the backend returns English-only** — status/reason/plan text is code-keyed
> on the server, never localized (confirmed by the product owner).

## 1. Scope & goals

- Support exactly **two languages**: English (current, default/fallback) and Russian. Built so a
  third could be added by dropping in a locale folder — no architectural change.
- **Initial language = the browser's language**, overridable by an explicit in-app choice that
  persists across reloads.
- This document delivers the **decision, the conventions, and the extraction inventory only**. It
  does **not** write any Russian copy or move any strings — that's the follow-up work, phased in §9.

**Explicitly out of scope here:** writing the Russian translations, building a language-switcher UI
component (the mechanism is specified; the visual is a later design task), and RTL/bidi support
(both target languages are LTR).

## 2. Decision: `react-i18next`

Use **`i18next`** (framework-agnostic core) + **`react-i18next`** (React bindings) +
**`i18next-browser-languagedetector`** (browser-language detection).

```bash
npm i i18next react-i18next i18next-browser-languagedetector
```

### Why this over the alternatives

| Option | Verdict |
|---|---|
| **react-i18next** | ✅ Chosen. De-facto React standard, hook-based (`useTranslation`), lazy namespaces, interpolation, CLDR pluralization, first-class TS key typing. Pairs cleanly with our module/barrel layout. |
| react-intl (FormatJS) | Heavier, ICU-message-syntax-first. Its strength (rich multi-locale date/number/plural formatting) is more than two LTR languages need. |
| LinguiJS | Good DX but adds a compile/macro build step and has a smaller ecosystem. |
| Hand-rolled `t()` + a Zustand map | Rejected. At two languages it's tempting, but we'd reinvent — badly — pluralization, interpolation, detection, and persistence. **Russian has three plural forms** (1 товар / 2 товара / 5 товаров); a naïve `count === 1 ? a : b` is simply wrong. i18next gets this from CLDR for free. |

### How it fits our architecture

i18next slots in **without disturbing the data-flow split** (§ CLAUDE.md). It is not React state and
not server state — it's a module-level singleton, exactly the shape we already use for `session.ts`
and `feedClient.ts`:

- **No Zustand store for language.** react-i18next keeps the active language inside the i18next
  instance and re-renders `useTranslation` subscribers on `changeLanguage`. Adding a parallel Zustand
  store would duplicate that — same reasoning that keeps `/me` in React Query and not in the token
  store.
- **The order-book firehose is untouched — a hard rule, not an aspiration.** Translation covers
  static chrome (labels, buttons, headers, notification *templates*) — **never** the streaming
  numeric payload, and **never** any `t()` / `i18n.language` / locale-aware `Intl` call on the
  per-frame path. No hot-path cost, no interaction with `orderbookStore` / the rAF flush. See the
  ⛔ HARD RULE in §6.4 for the full boundary; this is why numbers were decided fixed-format (§10.1).
- **Init once, imported for side effect** from `main.tsx` (before `<App/>`), like the other
  singletons. Two languages of chrome are small enough to **bundle synchronously** — we skip the
  Suspense/loading dance entirely (no `useSuspense`, no fallback spinner).

## 3. Configuration (`src/config/env.ts`)

The **default/fallback** locale is genuine runtime config, so it belongs in the one validated config
module — nothing reads `import.meta.env` directly (CLAUDE.md rule). The **detected** locale is the
detector's job, not env.

Add to the Zod schema in [`src/config/env.ts`](../../src/config/env.ts):

```ts
VITE_DEFAULT_LOCALE: z.enum(['en', 'ru']).default('en'),
```

…surfaced as `config.defaultLocale`. Used as i18next's `fallbackLng` and as the detector's final
fallback. A single `SUPPORTED_LOCALES = ['en', 'ru'] as const` tuple (in the i18n module) is the one
source for the supported set — the detector's `supportedLngs`, the type union, and any future
switcher all read from it.

## 4. Module shape (`src/lib/i18n/`)

Infra lives in `lib/` (shared, framework-adjacent), mirroring `lib/ws/` and `lib/api/`:

```
src/lib/i18n/
  index.ts            # createInstance() + .use(LanguageDetector).use(initReactI18next).init(); exported `i18n`
  config.ts           # SUPPORTED_LOCALES tuple, Locale type, detector options, namespace list
  i18next.d.ts        # module augmentation: type-safe keys from the `en` resources (§7)
  locales/
    en/  common.json  auth.json  orderbook.json  billing.json  settings.json  landing.json  validation.json
    ru/  common.json  auth.json  orderbook.json  billing.json  settings.json  landing.json  validation.json
```

- **Namespaces mirror the feature modules** (`auth`, `orderbook`, `billing`, `settings`, `landing`)
  plus two cross-cutting ones: `common` (shared component copy — Button labels, generic errors) and
  `validation` (all form + rule messages, see §6.3). This mirrors the barrel-per-feature convention:
  a feature owns its namespace.
- **Detection order** (`i18next-browser-languagedetector`): `localStorage` → `navigator` →
  `config.defaultLocale`. `localStorage` first means an explicit user choice wins on the next visit;
  `navigator` gives the "browser language" default on first visit; `defaultLocale` is the floor.
  Persist the chosen key under a namespaced localStorage key (e.g. `screener.locale`), consistent
  with `storage.ts`'s guarded-localStorage approach — wrap access so private-mode can't crash boot.
- **Switching language** later is just `i18n.changeLanguage('ru')`; the detector's `caches: ['localStorage']`
  persists it. No store, no context provider needed beyond what `initReactI18next` installs.

## 5. Usage conventions

```tsx
// component reads its feature namespace
const { t } = useTranslation('auth');
<label>{t('login.emailLabel')}</label>
<button>{t('login.submit')}</button>

// interpolation (never string-concatenate translated fragments)
t('verify.resendIn', { seconds })          // "Resend in {{seconds}}s"

// pluralization — let i18next pick the CLDR form (critical for RU)
t('billing.dayCount', { count: days })     // en: one/other; ru: one/few/many
```

**Key-naming rules (enforce in review):**
- Dotted, namespaced by screen/section: `login.submit`, `pricing.badge.flexible`, `history.status.paid`.
- Keys describe **role, not English text** (`submit`, not `signInButton` — the value can change).
- **No sentence assembly in code.** A full sentence is one key with interpolation, so word order can
  differ in Russian. Never `t('x') + ' ' + variable + t('y')`.
- Numbers/dates go through the shared formatters (§6.4), not inline in the key.

## 6. The four translation surfaces (and how each is handled)

Extraction is not just "JSX text." There are four distinct surfaces, and two of them are easy to miss.

### 6.1 Inline JSX / component copy — the obvious surface

Static text in pages and components: headings, paragraphs, button labels, `placeholder`/
`aria-label`/`title` attributes (the sweep found **45** such attributes across 15 files alone).
→ Replace with `t('ns:key')`. Full per-file inventory in §8.

### 6.2 Code-keyed server-data maps — **the important one**

The backend sends **codes**, not text; the frontend already maps each code to an English string.
These maps are the `planCode → copy` pattern the user flagged. They become **key lookups**, not
inline English:

| Location | Map | Codes |
|---|---|---|
| [`billing/catalog.ts`](../../src/features/billing/catalog.ts) | `PLAN_COPY` — `name`, `badge`, `desc` per plan | `pay_as_you_go`, `weekly`, `monthly`, `yearly` |
| [`billing/historyView.ts`](../../src/features/billing/historyView.ts) | `STATUS.label` | `CREATED`/`PENDING`/`PAID`/`EXPIRED`/`FAILED`/`CANCELED`/`REVERTED` |
| [`billing/historyView.ts`](../../src/features/billing/historyView.ts) | `REASON` (9 codes) + the inline `'Awaiting payment'` / `'Order created'` defaults in `buildTimeline` | transition reason codes |
| [`billing/historyView.ts`](../../src/features/billing/historyView.ts) | `SOURCE.label` | `PURCHASE`/`TRIAL`/`ADMIN` |

**Pattern:** keep the code→**key** structure (and the colors, which are *not* localized) in these
modules, but resolve the label through `t()` at render time. Two clean options — pick one and apply
it everywhere:
- **(a)** Store `labelKey: 'billing:history.status.paid'` in the map; the component does
  `t(entry.labelKey)`. Map stays a pure constant; translation happens in React. **Recommended** —
  keeps `historyView.ts`/`catalog.ts` free of the i18next instance and testable.
- **(b)** Pass `t` into `buildPlanViews`/`buildTimeline`. More invasive; couples pure helpers to i18n.

Either way the **fallback-to-raw-code** behavior (`REASON[e.reason] ?? e.reason`) is preserved: an
unmapped/unknown code still shows the code, never a blank or a crash. Same for unknown plan codes
(already dropped/ignored in `catalog.ts`).

### 6.3 Form-validation & client-rule messages

User-facing strings living in Zod schemas and validators:
- [`auth/validation.ts`](../../src/features/auth/validation.ts) — `'First name is required'`,
  `'Enter a valid email'`, `'Password must be at least 8 characters long'`, `'Passwords do not match'`, etc.
- [`settings/rulesValidation.ts`](../../src/features/settings/rulesValidation.ts) — `'minNotional must be ≥ 0'`,
  `'maxDistance must be in (0, 0.1]'`.

**Pattern:** Zod messages should be **keys**, resolved where the error is *displayed*, not where the
schema is *defined* (a schema is a module-level constant evaluated once, before any `t` is ready and
before a language is picked — baking English in there defeats switching). Two viable approaches:
- Put a stable key string as the Zod message (`z.email('validation:email.invalid')`) and run the
  field error through `t()` in the component that renders it. Simplest, minimal churn.
- Or use i18next's Zod error-map integration to translate at render. Heavier; only if messages
  proliferate.
→ Decide one for the whole app during the auth slice (§9) so `validation.ts` and `rulesValidation.ts`
match.

### 6.4 Locale-sensitive formatting (dates & numbers) — **the other easy-to-miss one**

Translation ≠ localization. The sweep found **hardcoded `'en-US'` / `'en-GB'`** in 8 files:
`Intl.NumberFormat`/`DateTimeFormat`/`toLocaleDateString` in
[`billing/catalog.ts`](../../src/features/billing/catalog.ts),
[`billing/historyView.ts`](../../src/features/billing/historyView.ts),
[`billing/pages/AccountPage.tsx`](../../src/features/billing/pages/AccountPage.tsx),
[`billing/pages/PayByDaysPage.tsx`](../../src/features/billing/pages/PayByDaysPage.tsx),
[`billing/pages/PaymentMethodPage.tsx`](../../src/features/billing/pages/PaymentMethodPage.tsx),
[`billing/pages/PaymentStatusPage.tsx`](../../src/features/billing/pages/PaymentStatusPage.tsx),
[`settings/rulesValidation.ts`](../../src/features/settings/rulesValidation.ts),
[`landing/components/OrderBookPreview.tsx`](../../src/features/landing/components/OrderBookPreview.tsx).

**Dates** must localize (Russian month names, `DD.MM.YYYY` ordering) — feed `Intl` the active
`i18n.language` instead of a literal. **Numbers do not localize** (owner-confirmed, §10.1): order-book
prices/notionals, billing amounts, and rule-editor thresholds all keep a fixed, universally-readable
format (`1,500,000`) regardless of UI language. Rule:
- **Dates & times** → localize via `i18n.language` through `formatDate`.
- **All numbers** (order-book data, billing amounts, day counts, rule-editor thresholds) → keep the
  existing fixed format. The `Intl.NumberFormat` constants that exist today stay exactly as they are;
  don't route them through i18n.

Centralize the date side in a small `lib/i18n/format.ts` (`formatDate`) that reads the active
language, so the choice lives in one place rather than scattered `'en-GB'`/`'en-US'` date literals.
The number formatters stay as fixed module-level constants where they already live. **The date-format
swap is a real scope item — flag it explicitly; it's not covered by string extraction.**

> ### ⛔ HARD RULE: **never** put i18n on the order-book hot path — really, never.
>
> No `t()`, no `i18n.language` read, no `formatNumber`, no locale-aware `Intl` construction anywhere
> in the per-frame path: `feedClient.ts`'s flush, `applyMessages()`, `selectNotifications.ts`,
> `cooldown.ts`, `OrderbookCard`'s numeric rendering, or anything else that runs per WebSocket
> batch / per animation frame. This is non-negotiable — it's the whole reason numbers were decided
> fixed-format (§10.1). The firehose renders raw/fixed-format numeric data with **zero** i18n calls;
> translation touches only static chrome and the *templates* of notifications (headings, labels,
> button copy), never per-level streaming values. If a future feature seems to need a localized
> number in the stream, revisit this document and the §10.1 decision first — do not quietly add an
> `Intl` call to the flush.

**Escape hatch: hover-only / event-triggered strings may still translate, if computed off the
render path.** The rule above bans i18n from the *render body* of a hot-path component — it does
not ban translating a string that's cheap to defer entirely off the render cadence. Concrete case:
`OrderbookCard`'s `Row` shows a "First seen X ago" tooltip on hover. The tooltip only matters while
a user is actively hovering one specific row — which is rare relative to render frequency — so
instead of building the string (translated or not) in the render body on every WS-driven re-render,
`Row` computes it lazily inside `onMouseEnter` and writes it straight to the DOM node
(`e.currentTarget.title = i18n.t(...)`), never touching React state or the render body. This makes
the translate call run once per hover, zero times per render — fully decoupled from the firehose, so
translating it doesn't reopen the hard rule.

**Read the i18n singleton directly here — do NOT reach for `useTranslation()`.** A tooltip written
imperatively on hover is never rendered in JSX, so it needs no *reactivity*: there is no rendered
string that must update when the language changes (the next hover reads the current locale on its
own). Calling `useTranslation('orderbook')` in the `Row` body would put a hook call back on the
per-frame render path — cheap, but not zero, and it contradicts the very principle this hatch exists
to uphold. Instead import the `i18n` singleton (`@/lib/i18n`) and call `i18n.t('orderbook:card.firstSeen', …)`
inside the handler. This is the same "read the module-level singleton via `getState()`/direct
access on the hot path rather than subscribing" shape used by `session.ts` and `feedClient.ts`, and
it keeps the render body *truly* i18n-free — no `t()`, no hook, nothing.

**The pattern, generalized:** if a hot-path component has a string that's only observed on a discrete
user action (hover, click, focus) rather than on every render, move its computation (translated or
not) into that action's event handler and translate it there via the `i18n` singleton, not a hook.
That's a legitimate way to add translation near a hot-path component; quietly calling `t()` inside
the render body "because it's cheap" — or leaving a `useTranslation()` hook on the per-frame path —
is not — see the precedent-erosion reasoning above.

### 6.5 Backend `ApiError` messages

The backend's `{ message, status, path }` envelope carries **English** prose
([`lib/api/client.ts`](../../src/lib/api/client.ts) → `ApiError`). Since the backend won't localize,
a raw `ApiError.message` shown to the user will be English even in Russian mode.
- **Preferred:** components render errors from **HTTP status / known code**, mapping to a
  `validation:`/`common:` key — not by echoing `error.message`. Most auth flows already key off status
  (e.g. 401 → "invalid credentials") rather than the server string, so this is mostly a matter of not
  regressing to `{error.message}` during extraction.
- **Fallback:** where no specific key exists, show a generic translated "Something went wrong" and log
  the server message. Never surface a raw English server string as primary UI in RU.
- Audit `catch`/error-rendering sites during each feature's extraction; note any that display
  `error.message` directly.

## 7. Type safety (do this on day one)

Add `src/lib/i18n/i18next.d.ts` augmenting i18next's `CustomTypeOptions` with the shape of the **`en`**
resource JSON as the canonical key set. Then `t('auth:login.submitt')` is a **compile error** — which
matters because `npm run typecheck` is the *only* automated gate in this repo (no tests, no lint). It
also gives editor autocomplete for keys and flags any `ru` file that drifts from `en`.

## 8. Codebase inventory — what needs extraction

Every file below holds user-facing English today. Grouped by namespace; "logic-only" files (stores,
api clients, `feedClient`, `session`, `schemas`, `types`, formatting helpers with no *displayed*
strings) are intentionally excluded. Files marked **[server-map]** are §6.2, **[validation]** are
§6.3, **[format]** are §6.4.

### `landing` namespace
- [`landing/constants.ts`](../../src/features/landing/constants.ts) — `STATS` captions + all six
  `FEATURES` `label`/`body` marketing blocks (the largest single block of prose in the app).
- [`landing/components/HeroSection.tsx`](../../src/features/landing/components/HeroSection.tsx),
  [`PricingSection.tsx`](../../src/features/landing/components/PricingSection.tsx),
  [`PlanCard.tsx`](../../src/features/landing/components/PlanCard.tsx),
  [`FeaturesSection.tsx`](../../src/features/landing/components/FeaturesSection.tsx),
  [`CtaSection.tsx`](../../src/features/landing/components/CtaSection.tsx),
  [`LandingHeader.tsx`](../../src/features/landing/components/LandingHeader.tsx),
  [`LandingFooter.tsx`](../../src/features/landing/components/LandingFooter.tsx) — headings, CTAs, nav labels, footer.
- [`landing/components/OrderBookPreview.tsx`](../../src/features/landing/components/OrderBookPreview.tsx) — **[format]** `'en-US'` number format.

### `auth` namespace
- [`auth/pages/RegisterPage.tsx`](../../src/features/auth/pages/RegisterPage.tsx) — 10 label/placeholder attrs + headings/links.
- [`auth/pages/LoginPage.tsx`](../../src/features/auth/pages/LoginPage.tsx) — 4 label/placeholder attrs + copy.
- [`auth/pages/VerifyEmailPage.tsx`](../../src/features/auth/pages/VerifyEmailPage.tsx),
  [`auth/pages/CheckInboxPage.tsx`](../../src/features/auth/pages/CheckInboxPage.tsx) — status prose, resend copy.
- [`auth/components/RegisterMarketing.tsx`](../../src/features/auth/components/RegisterMarketing.tsx),
  [`auth/components/AuthBadge.tsx`](../../src/features/auth/components/AuthBadge.tsx) — side-panel marketing.
- [`components/layouts/SplitAuthLayout.tsx`](../../src/components/layouts/SplitAuthLayout.tsx),
  [`CenteredAuthLayout.tsx`](../../src/components/layouts/CenteredAuthLayout.tsx) — any layout chrome text.
- **[validation]** [`auth/validation.ts`](../../src/features/auth/validation.ts) → `validation` namespace.

### `orderbook` namespace
- [`orderbook/components/DashboardHeader.tsx`](../../src/features/orderbook/components/DashboardHeader.tsx) — header labels/attrs.
- [`orderbook/components/OrderbookCard.tsx`](../../src/features/orderbook/components/OrderbookCard.tsx) — card labels (bid/ask/empty states).
- [`orderbook/components/NotificationPanel.tsx`](../../src/features/orderbook/components/NotificationPanel.tsx) — 6 attrs + panel copy/empty state.
- [`orderbook/components/NotificationCard.tsx`](../../src/features/orderbook/components/NotificationCard.tsx),
  [`NotificationHandle.tsx`](../../src/features/orderbook/components/NotificationHandle.tsx) — **notification templates** (interpolate symbol/side/price — §5, do NOT concatenate).
- [`orderbook/components/SortMenu.tsx`](../../src/features/orderbook/components/SortMenu.tsx) — sort-option labels.
- [`orderbook/pages/DashboardPage.tsx`](../../src/features/orderbook/pages/DashboardPage.tsx) — any empty/loading/connection copy.
- Check [`orderbook/tiers.ts`](../../src/features/orderbook/tiers.ts) for any tier *labels* (colors stay).

### `billing` namespace
- **[server-map]** [`billing/catalog.ts`](../../src/features/billing/catalog.ts) — `PLAN_COPY` name/badge/desc + the `'from 1 day, any amount'` / unit strings. **[format]** `'en-US'`.
- **[server-map]** [`billing/historyView.ts`](../../src/features/billing/historyView.ts) — `STATUS`/`REASON`/`SOURCE` labels + `buildTimeline` defaults. **[format]** date/number.
- [`billing/pages/BillingHistoryPage.tsx`](../../src/features/billing/pages/BillingHistoryPage.tsx) — 7 attrs + tab/empty/section copy.
- [`billing/pages/AccountPage.tsx`](../../src/features/billing/pages/AccountPage.tsx) — **[format]** + account copy.
- [`billing/pages/ChoosePlanPage.tsx`](../../src/features/billing/pages/ChoosePlanPage.tsx),
  [`PayByDaysPage.tsx`](../../src/features/billing/pages/PayByDaysPage.tsx),
  [`PaymentMethodPage.tsx`](../../src/features/billing/pages/PaymentMethodPage.tsx),
  [`PaymentStatusPage.tsx`](../../src/features/billing/pages/PaymentStatusPage.tsx),
  [`CheckoutStubPage.tsx`](../../src/features/billing/pages/CheckoutStubPage.tsx) — flow copy; **[format]** `'en-US'`/`'en-GB'` in several.
- [`billing/components/BillingHeader.tsx`](../../src/features/billing/components/BillingHeader.tsx),
  [`AccountLayout.tsx`](../../src/features/billing/components/AccountLayout.tsx),
  [`PlanChoiceCard.tsx`](../../src/features/billing/components/PlanChoiceCard.tsx) — chrome + card copy.

### `settings` namespace
- [`settings/components/SettingsModal.tsx`](../../src/features/settings/components/SettingsModal.tsx),
  [`ClassificationRules.tsx`](../../src/features/settings/components/ClassificationRules.tsx),
  [`RuleEditor.tsx`](../../src/features/settings/components/RuleEditor.tsx),
  [`CustomRulesList.tsx`](../../src/features/settings/components/CustomRulesList.tsx),
  [`NotificationsSettings.tsx`](../../src/features/settings/components/NotificationsSettings.tsx),
  [`MinimumTierControl.tsx`](../../src/features/settings/components/MinimumTierControl.tsx),
  [`MutedTickers.tsx`](../../src/features/settings/components/MutedTickers.tsx),
  [`UpgradeNote.tsx`](../../src/features/settings/components/UpgradeNote.tsx) — labels, headings, help text, attrs.
- **[validation]** [`settings/rulesValidation.ts`](../../src/features/settings/rulesValidation.ts) — error strings; **[format]** `'en-US'`.

### `common` namespace (shared components)
- [`components/Button.tsx`](../../src/components/Button.tsx), [`Banner.tsx`](../../src/components/Banner.tsx),
  [`TextField.tsx`](../../src/components/TextField.tsx), [`PasswordField.tsx`](../../src/components/PasswordField.tsx),
  [`Card.tsx`](../../src/components/Card.tsx), [`BrandMark.tsx`](../../src/components/BrandMark.tsx),
  [`TickerStrip.tsx`](../../src/components/TickerStrip.tsx) — audit for any **default** text (e.g. a password
  show/hide `aria-label`, a generic "Loading"). Most are prop-driven and may need zero keys; confirm during the shared-components pass.

> The `<title>`/document metadata and any hardcoded `<html lang>` should also be set from the active
> locale (set `document.documentElement.lang` on language change) — small but real.

## 9. Rollout phasing

Ship the infra + one proven vertical slice first, then extract feature-by-feature. Each phase ends
green on `npm run typecheck`.

1. **Infra (no visible change).** Deps, `lib/i18n/` module, `config.defaultLocale`, detector,
   `i18next.d.ts`, `lib/i18n/format.ts`, empty-but-typed `en`/`ru` namespace files, wire init into
   `main.tsx`. English still renders (from `en` JSON); RU files exist as stubs.
2. **Auth slice (the pattern-setter).** Extract the `auth` + `validation` namespaces end to end,
   settle the Zod-message approach (§6.3) and the error-rendering rule (§6.5). This slice is the
   reference every later feature copies.
3. **Landing** (most prose; `constants.ts` marketing).
4. **Billing** (exercises the §6.2 server-map pattern + §6.4 formatting hardest).
5. **Settings.**
6. **Orderbook / dashboard** (notification templates — §5 interpolation discipline).
7. **Shared `common` components** + a language-switcher UI (separate design task).
8. **Russian copy pass** — translators/owner fill the `ru` JSON; `i18next.d.ts` typing surfaces any
   key drift.

Steps 3–6 are independent and can be reordered by priority.

## 10. Open questions

Questions 1–3 are **RESOLVED** (owner-confirmed 2026-07-12); they governed the whole extraction so
they were closed before the auth slice. 4–5 remain open but don't block starting.

1. **Number localization — RESOLVED: all numbers stay fixed-format; only dates/times localize.**
   Billing amounts, order-book figures, and rule-editor thresholds all render in a fixed format
   (`1,500,000`), regardless of UI language. Only **dates and times** localize, via `i18n.language`
   through the shared `formatDate` helper. Rationale: traders read `1,500,000` fine; a fixed format
   keeps the rule-editor's separator-stripping parse predictable; and — decisively — it keeps i18n
   **out of the order-book hot path entirely** (see the hard rule below). This is *less* work than
   localizing numbers, not more: the existing `Intl.NumberFormat` constants stay as-is.
2. **Zod / validation message strategy — RESOLVED: key-as-message + translate-at-render, for
   *frontend* copy only.** Two separate things were being conflated:
   - **Frontend-authored validation copy** (the strings in `auth/validation.ts` and
     `settings/rulesValidation.ts` — e.g. `'Password must be at least 8 characters long'`) *are*
     ours and *do* get translated. A schema is a module-level constant evaluated once at import,
     before any language is picked, so store a stable **key** as the Zod message
     (`'validation:password.tooShort'`) and resolve it with `t()` where the field error is rendered.
   - **Backend JSON is never translated.** The backend returns technical, code-keyed English; the
     **frontend always decides what to display**, mapping HTTP status / known codes to our own
     `validation:`/`common:` keys. Never echo `ApiError.message` as primary UI. This isn't a
     translation task — it's a "don't regress to `{error.message}` during extraction" audit (§6.5).
   - **The one intentional exception:** `PaymentStatusPage`'s `order.reasonDetail` is rendered raw
     *on purpose* to reveal the provider/backend-facing error verbatim. Leave `reasonDetail`
     untranslated; translate only its English `??` fallback. Keep a code comment there so a future
     pass doesn't "fix" it.
3. **Server-map translation style — RESOLVED: store `labelKey` in the constant maps.** In
   `catalog.ts` / `historyView.ts`, keep the code→**key** structure (and the non-localized colors)
   as pure constants; the component resolves `t(entry.labelKey)` at render. Keeps those modules free
   of the i18next instance and testable. Fallback-to-raw-code behavior is preserved.
4. **Language switcher** — is an explicit UI switcher wanted now, or is browser-detection-only enough
   for launch (switcher deferred)? Detection works without any UI; the switcher is additive. *(Open.)*
5. **Russian copy ownership** — who writes/reviews the translations (owner, translator, or
   machine-translation-then-review)? Affects step 8 timing. *(Open.)*
