# i18n Progress — What's Already Localized

> Status snapshot. Written 2026-07-25. Companion to the design doc at
> [`.claude/plans/i18n-localization.md`](../plans/i18n-localization.md) — read that first for the
> *why* behind every decision below. This document only tracks *what has actually landed* against
> that plan's §9 rollout phasing, so a future session doesn't have to re-derive it from diffs.

## Where things stand against the plan's phasing (§9)

| Phase | Status | Notes |
|---|---|---|
| 1. Infra | ✅ Done, committed | `main` branch, via merge |
| 2. Auth slice | ✅ Done, committed | Commit `713cdd3` — "Localize auth slice (i18n phase 2)" |
| 3. Landing | ✅ Done, **not committed** | Working tree changes only — see below |
| 4. Billing | ❌ Not started | `billing.json` is still `{}` in both locales |
| 5. Settings | ❌ Not started | `settings.json` is still `{}` in both locales |
| 6. Orderbook / dashboard | ❌ Not started | `orderbook.json` is still `{}` in both locales |
| 7. Shared `common` + language switcher | ⚠️ Partial | `common.json` has a handful of keys (see below); no switcher UI exists |
| 8. Russian copy pass | ⚠️ Ongoing per-slice | RU translations were written alongside each extracted slice (not deferred to the end) — auth and landing RU copy already exist and read as real Russian, not machine stubs |

**If you're resuming this work:** phases 1–3 are the reference implementation. Copy their pattern
exactly for billing/settings/orderbook rather than re-deriving conventions — the deviations below
(dev-dependency install, `Trans` usage, `ParseKeys` typing) are things the plan didn't spell out in
full but the actual code now demonstrates.

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

## Phase 3: Landing (uncommitted — working tree only)

**Not yet committed.** `git status` shows all of `landing/components/{CtaSection,FeaturesSection,
HeroSection,LandingFooter,LandingHeader,PlanCard,PricingSection}.tsx`, `landing/constants.ts`, and
both `lib/i18n/locales/{en,ru}/landing.json` as modified-but-unstaged. Verify with `git diff` before
assuming this work is on `main` or even safely stashable — it is a real, working, typechecked slice
that simply hasn't been committed yet.

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

## What's explicitly NOT done yet

- **Billing** (`billing.json` empty both locales): `catalog.ts` (`PLAN_COPY`), `historyView.ts`
  (`STATUS`/`REASON`/`SOURCE` label maps + `buildTimeline` defaults), and every billing page
  (`ChoosePlanPage`, `PayByDaysPage`, `PaymentMethodPage`, `PaymentStatusPage`,
  `BillingHistoryPage`, `AccountPage`, `CheckoutStubPage`) are still 100% English. This is also
  where the plan's §6.4 date-format swap (`formatDate` replacing the hardcoded `'en-US'`/`'en-GB'`
  literals in `catalog.ts`, `historyView.ts`, `AccountPage.tsx`, `PayByDaysPage.tsx`,
  `PaymentMethodPage.tsx`, `PaymentStatusPage.tsx`) has not happened — `formatDate` exists and
  works (used nowhere yet outside its own module).
- **Settings** (`settings.json` empty both locales): classification rules UI, notification prefs
  UI, and `settings/rulesValidation.ts` (including its own `'en-US'` number-format literal) are all
  still English.
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
- Before starting billing (phase 4), re-read plan §6.2 and §6.4 together — it's the phase that
  exercises both the labelKey server-map pattern *and* the date-formatting swap in the same slice,
  and the plan calls this out as the hardest one.
