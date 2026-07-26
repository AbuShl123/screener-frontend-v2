# i18n Progress — What's Already Localized

> Status snapshot. Written 2026-07-25, updated 2026-07-25 (phase 4 committed). Companion to the design
> doc at [`.claude/plans/i18n-localization.md`](../plans/i18n-localization.md) — read that first for
> the *why* behind every decision below. This document only tracks *what has actually landed*
> against that plan's §9 rollout phasing, so a future session doesn't have to re-derive it from diffs.

## Where things stand against the plan's phasing (§9)

| Phase | Status | Notes |
|---|---|---|
| 1. Infra | ✅ Done, committed | `main` branch, via merge |
| 2. Auth slice | ✅ Done, committed | Commit `713cdd3` — "Localize auth slice (i18n phase 2)" |
| 3. Landing | ✅ Done, committed | Commit `9b6d15a` — "Localize landing page (i18n phase 3)" |
| 4. Billing | ✅ Done, committed | Commit `585052e` — "Localize billing (i18n phase 4)"; reviewed 2026-07-25 |
| 5. Settings | ✅ Done, **not committed** | Working tree changes only — see below; `settings.json` fully populated in both locales |
| 6. Orderbook / dashboard | ❌ Not started | `orderbook.json` is still `{}` in both locales |
| 7. Shared `common` + language switcher | ⚠️ Partial | `common.json` has a handful of keys (see below); no switcher UI exists |
| 8. Russian copy pass | ⚠️ Ongoing per-slice | RU translations were written alongside each extracted slice (not deferred to the end) — auth, landing, and billing RU copy already exist and read as real Russian, not machine stubs |

**If you're resuming this work:** phases 1–4 are all committed and are the reference implementation
(phase 5, settings, is done but uncommitted in the working tree). Copy their pattern exactly for
orderbook rather than re-deriving conventions — the deviations below (dev-dependency install,
`Trans` usage, `ParseKeys` typing, the `planCopy.ts` resolver) are things the plan didn't spell out
in full but the actual code now demonstrates.

## Phase 1: Infra

Deps added (`package.json`): `i18next`, `i18next-browser-languagedetector`, `react-i18next`.

Built exactly to the plan's §3–§4 shape, in [`src/lib/i18n/`](../../src/lib/i18n/):

- **`config.ts`** — `SUPPORTED_LOCALES = ['en', 'ru']`, `Locale` type, `NAMESPACES` tuple
  (`common`, `auth`, `orderbook`, `billing`, `settings`, `landing`, `validation`),
  `DEFAULT_NAMESPACE = 'common'`, `LOCALE_STORAGE_KEY = 'screener.locale'`, the detector's
  `detectionOptions` (`localStorage` → `navigator`, cached to `localStorage`), plus `isLocale` /
  `resolveLocale` helpers (the latter narrows a region variant like `ru-RU` down to `ru`).
- **`index.ts`** — the `i18n` singleton: `createInstance().use(LanguageDetector).use(initReactI18next).init(...)`.
  All seven namespaces × both locales are imported as static JSON and bundled synchronously
  (`resources` map) — no lazy namespaces, no Suspense (`react: { useSuspense: false }`), matching
  the plan's "two languages of chrome is small enough to bundle" call. `fallbackLng` reads
  `config.defaultLocale`. Also wires `document.documentElement.lang` to sync on every
  `languageChanged` event (the plan's §8 footnote item). Imported for its side effect from
  `main.tsx` before `<App/>` renders — same singleton shape as `session.ts` / `feedClient.ts`.
- **`format.ts`** — `formatDate(iso, options?)`, the one place `i18n.language` feeds `Intl` (via
  `resolveLocale`). Carries an explicit ⛔ comment banning any use on the order-book hot path, per
  the plan's hard rule. Numbers are untouched everywhere, as decided.
- **`i18next.d.ts`** — module augmentation typing `CustomTypeOptions.resources` off the **`en`**
  JSON shape, so a bad/typo'd key is a `tsc` error and a `ru` file that drifts from `en`'s key set
  surfaces as a type error too.
- **`useValidationError.ts`** — the render-time resolver for the §6.3 key-as-Zod-message pattern:
  takes an optional key string (or `undefined`), returns translated text or `undefined`. Isolates
  the one `as any` cast needed because a runtime string can't satisfy i18next's typed key union.
- **`config/env.ts`** — added `VITE_DEFAULT_LOCALE: z.enum(['en', 'ru']).default('en')`, surfaced
  as `config.defaultLocale`.
- All seven namespace JSON files exist for both `en`/`ru`. After phases 1–3, `auth.json` and
  `landing.json` are fully populated in both locales; `common.json`/`validation.json` have the
  handful of cross-cutting keys phases 1–2 needed; `orderbook.json`/`billing.json`/`settings.json`
  are still `{}` placeholders.

No language-switcher UI exists yet (§9 phase 7, deferred) — language is currently
detection/localStorage-only, exactly as the plan's open question 4 left it.

## Phase 2: Auth slice (commit `713cdd3`)

Extracted end-to-end: `RegisterPage`, `LoginPage`, `VerifyEmailPage`, `CheckInboxPage`,
`RegisterMarketing`, `SplitAuthLayout`, and `auth/validation.ts`. This slice is the pattern every
later phase should copy:

- **Zod messages are keys, resolved at render** (§6.3, resolved option 1): `auth/validation.ts`
  schemas carry strings like `'validation:password.tooShort'` as the Zod message instead of
  English prose; each page calls `useValidationError()` once and passes `fieldError(errors.x?.message)`
  into the field's `error` prop.
- **Sentence assembly with markup uses `<Trans>`, not string concat.** E.g. `LoginPage`'s disabled-
  account banner and unverified-email banner both use `react-i18next`'s `Trans` component with a
  `components={{ support: <a .../> }}` / `components={{ strong: <strong .../> }}` map, keeping the
  translator free to reorder words around the embedded tag. This is a concrete answer to the plan's
  §5 "no sentence assembly" rule for the case where the sentence contains inline markup — the plan
  didn't spell out the mechanism; `Trans` is it.
- **§6.5 (backend `ApiError` messages) is enforced**: the old fallback of showing
  `submitError.message` raw was replaced with a generic translated key
  (`t('common:errors.generic')`) for any unexpected/unclassified error. Known states (invalid
  creds, unverified, disabled) still branch on HTTP status/flags exactly as before — just now
  render translated copy instead of hardcoded English.
- Every page opens with `useTranslation(['auth', 'common'])` (or just `'auth'`) at the top,
  matching the plan's per-feature-namespace convention.
- Both `en/auth.json` and `ru/auth.json` are fully written (not stubs) — real Russian prose, not
  machine-translation placeholders.

## Phase 3: Landing (commit `9b6d15a`)

Covers all of `landing/components/{CtaSection,FeaturesSection,HeroSection,LandingFooter,
LandingHeader,PlanCard,PricingSection}.tsx`, `landing/constants.ts`, and both
`lib/i18n/locales/{en,ru}/landing.json`.

What's done:

- Every landing component now reads from the `landing` namespace via `useTranslation('landing')`
  and `t('section.key')` — headings, nav labels, CTAs, footer copy, the hero lead paragraph, the
  pricing trial badge/note, all six feature cards.
- **`landing/constants.ts`** demonstrates the §6.2 server-map/labelKey pattern applied to a
  *non-server* map: `STATS` and `FEATURES` used to carry raw English `caption`/`label`/`body`
  strings; they now carry `captionKey` / `labelKey` / `bodyKey` (plus the untouched fixed
  marketing figures like `'500+'` and the glyph shapes), resolved with `t()` in the component that
  renders each card. A new `LandingKey = ParseKeys<'landing'>` type (from `i18next`) type-checks
  every key literal in the array against the actual `landing.json` shape — a typo'd key is a
  compile error, same guarantee `i18next.d.ts` gives `t()` calls directly.
- Interpolation is used correctly for the trial-length copy: `t('hero.startTrial', { days:
  TRIAL_DAYS })` / `t('cta.title', { days: TRIAL_DAYS })` etc., never string-concatenated.
- `<Trans>` is used again for the hero lead paragraph (`<mono>500+</mono>` / `<mono>20+</mono>`
  inline formatting) and the pricing trial note (`<strong>` around the day count) — same mechanism
  as the auth slice.
- `PlanCard.tsx` (a landing component, despite consuming `billing`'s `PlanView` type) only
  localizes its own static "Start now" button chrome — it does **not** touch `billing/catalog.ts`'s
  `PLAN_COPY` (plan name/badge/desc). That server-map extraction is explicitly phase 4 (billing),
  not done yet; plan/pricing *names and descriptions* rendered via `PlanCard` are still English
  until billing is extracted.
- Both `en/landing.json` and `ru/landing.json` are fully written with real Russian copy, not stubs.

## Phase 4: Billing (commit `585052e`)

Covers `catalog.ts`, `historyView.ts`, `index.ts`, every billing page and the three billing
components, `landing/components/PlanCard.tsx`, the new `billing/planCopy.ts`, and both
`lib/i18n/locales/{en,ru}/billing.json`.

What's done (reviewed 2026-07-25 — `npm run typecheck` passes, key parity between `en`/`ru`
verified programmatically, no residual English strings found in a spot-check of every changed file):

- **§6.2 server-map/labelKey pattern, done via a shared resolver.** `catalog.ts`'s `PLAN_COPY` now
  stores `nameKey`/`badgeKey`/`descKey` (stable `billing:` keys) plus `unit`/`perDay` as
  `{ key, values }` descriptors — the module stays free of the i18next instance, exactly per the
  plan's recommended option (a). New **`billing/planCopy.ts`** (`resolvePlanDisplay(t, plan)`) is
  the single render-time resolver every consumer shares: `PlanChoiceCard`, `PaymentMethodPage`,
  `CheckoutStubPage`, and — closing the gap phase 3 explicitly left open — landing's `PlanCard.tsx`,
  which previously rendered `plan.name`/`plan.badge`/etc. as raw English and now resolves them
  through a `billing`-bound `t` alongside its own `landing`-namespace chrome. `historyView.ts`'s
  `STATUS`/`REASON`/`SOURCE` maps follow the identical labelKey shape, and fallback-to-raw-code is
  preserved everywhere (`PLAN[order.planCode] ?? order.planCode`, unmapped `REASON`, etc.).
- **§6.4 date-format swap actually happened.** `historyView.ts`'s `fmtDate`/`fmtDateTime`,
  `PaymentStatusPage.tsx`, `PayByDaysPage.tsx`, and `PaymentMethodPage.tsx` all now compute dates via
  the shared `formatDate` (`@/lib/i18n`) instead of a hardcoded locale string. All remaining
  `Intl.NumberFormat('en-US')` call sites (`catalog.ts`, `historyView.ts`, and four billing pages)
  are confirmed to be **amount/day-count formatting only** — correctly left fixed-format per §10.1 —
  not leftover date code.
- **§6.5 backend-message discipline mostly holds, with one pre-existing exception left as-is.**
  `PaymentStatusPage`'s `reasonDetail` verbatim-on-purpose case is preserved with its explanatory
  comment, matching the plan's locked exception in §10 Q2. `PaymentMethodPage.tsx`'s checkout-order
  error path, however, still echoes `ApiError.message` verbatim for *any* 4xx (only the fully-generic
  fallback got a translated key) — this predates phase 4 (pre-existing behavior, not a regression
  introduced by this slice) and now carries a comment citing §6.5, but it doesn't fully match the
  plan's *preferred* status-driven-key approach. Not a blocker; worth a follow-up note if a later
  session touches that page.
- Both `en/billing.json` and `ru/billing.json` are fully written with real Russian copy (259/267 raw
  keys respectively — the only divergence is expected CLDR plural-form counts: `en` needs
  `_one`/`_other`, `ru` needs `_one`/`_few`/`_many`; every base key lines up 1:1 across locales).
- `PLAN_NAME_KEYS` (derived from `PLAN_COPY`) is reused by `historyView.ts`'s `PLAN` map, keeping
  plan-name resolution in one place across `AccountPage`, `BillingHistoryPage`, and
  `PaymentStatusPage`.

## Phase 5: Settings (uncommitted — working tree only)

**Not yet committed.** `git status` shows all eight `settings/components/*.tsx`
(`SettingsModal`, `ClassificationRules`, `RuleEditor`, `CustomRulesList`, `NotificationsSettings`,
`MinimumTierControl`, `MutedTickers`, `UpgradeNote`), `settings/rulesValidation.ts`, both
`lib/i18n/locales/{en,ru}/settings.json`, and the two `validation.json` files as modified-but-unstaged.
It is a real, working, typechecked slice — verify with `git diff` before assuming it's on `main`.

What's done (`npm run typecheck` passes; `en`/`ru` key parity verified programmatically — 51/51
settings keys, 9/9 validation keys; no residual user-facing English in the components):

- Every settings component now reads its namespace via `useTranslation('settings')` and `t('…')` —
  the modal chrome (title/close/`SOON`/nav labels), both Notifications sub-panes (minimum-tier
  heading/desc/caption, muted-tickers search/list/empty), and the whole Classification-rules pane
  (intro, search, results, the inline `RuleEditor`, the custom-rules list, and the shared
  `UpgradeNote`).
- **§6.3 validation-key pattern reused exactly as auth did.** `rulesValidation.ts`'s `validateTiers`
  now returns `{ ok: false, errorKey }` carrying a stable `validation:rule.*` KEY (the two new
  `validation.json` keys `rule.minNotional` / `rule.maxDistance`) instead of English prose; the
  `RuleEditor` resolves it at render with `useValidationError()` (the same resolver the auth pages
  use). The backend-400 branch still shows `ApiError.message` verbatim (§6.5 user-safe envelope),
  and the generic save failure is now `t('rules.editor.saveError')`.
- **§6.2 labelKey pattern for the two in-component code maps.** `SettingsModal`'s `NAV` array and
  `RuleEditor`'s `SOURCE_KEY` map now store `ParseKeys<'settings'>` key literals (not English
  labels), resolved with `t()` at render — same shape as landing's `constants.ts` and billing's
  maps, with the typo-guard `ParseKeys` gives.
- **Interpolation, never concatenation** (§5): the minimum-tier caption is one key with `{{min}}` /
  `{{prev}}` (`notifications.tier.caption`), the "no tickers match" empties interpolate `{{query}}`,
  and the `N MUTED` / `N CUSTOM` badges interpolate `{{n}}`. The badges deliberately use a plain
  `{{n}}` variable, **not** i18next's `count`, so they stay fixed invariant labels rather than
  pulling in CLDR plural forms for a stylized mono chip.
- **§10.1 honored — no number localization.** `rulesValidation.ts`'s `formatNotional` keeps its
  `toLocaleString('en-US')` untouched: it formats a **notional (a number)**, which stays fixed-format
  per §10.1 — it is not a date, so it was correctly left alone (this resolves the phase-5 flag the
  practical-notes section raised).
- Both `en/settings.json` and `ru/settings.json` are fully written with real Russian copy, not stubs.

## What's explicitly NOT done yet

- **Orderbook / dashboard** (`orderbook.json` empty both locales): `DashboardHeader`,
  `OrderbookCard`, `NotificationPanel`, `NotificationCard`, `NotificationHandle`, `SortMenu`,
  `DashboardPage` — all still English. Note the plan's hard rule still applies untouched: nothing
  here should ever call `t()` / read `i18n.language` on the per-frame path.
- **Shared `common` components**: `Button`, `Banner`, `TextField`, `PasswordField`, `Card`,
  `BrandMark`, `TickerStrip` have not been individually audited for default text — `common.json`
  only has the keys that auth/landing needed so far (e.g. `errors.generic`), not a full pass.
- **Language switcher UI** — still just a design task on the backlog (plan open question 4).
- **`landing/components/OrderBookPreview.tsx`** — flagged in the plan as a `[format]` item
  (hardcoded `'en-US'` number format); not addressed, and per §10.1 this is likely intentional to
  leave as a fixed format rather than swap to `formatDate`/localized numbers — confirm against
  §10.1 before changing it.

## Practical notes for continuing this work

- Copy the auth slice's pattern for schema messages (`useValidationError` + key-as-Zod-message) and
  the landing slice's pattern for constants-with-keys (`ParseKeys<'namespace'>` + `labelKey`/
  `captionKey` fields) — both are now proven, not just proposed.
- Use `<Trans>` (not string concatenation, not raw `dangerouslySetInnerHTML`) any time translated
  text needs embedded markup (a link, `<strong>`, a `<mono>` span) or an interpolated value inside a
  sentence with markup around it.
- Run `npm run typecheck` after adding keys — the `i18next.d.ts` augmentation means a key typo in a
  component or a `ru` file that drifts from `en`'s shape both surface as compiler errors, which is
  the only automated gate this repo has for i18n correctness.
- Billing (phase 4) is now the second reference for the labelKey server-map pattern — copy
  `planCopy.ts`'s single-resolver shape (rather than re-deriving per page) if orderbook
  needs something similar for its own code-keyed maps.
- `settings/rulesValidation.ts`'s `'en-US'` number-format literal was confirmed (phase 5) to be a
  **notional** — a number, so left fixed-format per §10.1. When touching orderbook, apply the same
  test to each `Intl` literal: a date localizes via `formatDate`, a number stays as-is.
