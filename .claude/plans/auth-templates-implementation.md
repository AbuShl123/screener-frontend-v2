# Auth Feature Implementation Plan — "Screener Authentication Templates"

Source design: Claude Design project `Screener Authentication Templates`
(`Auth Pages.dc.html`, project id `1311c691-ada2-4d29-ab30-7ab9f335123a`).
API contract: [`.claude/docs/auth-api.md`](../docs/auth-api.md).

**Scope note**: desktop-only. The design contains a `1a`–`1j` set of small-resolution
card variants — these are ignored entirely, per product decision (no mobile support).
Only the desktop variants `2a`–`2c` and `3a`–`3g` are implemented. There is no
forgot/reset-password flow in either the design or the backend API — confirmed out
of scope.

## Screens covered (design → route → endpoint)

| ID | Screen | Route (proposed) | Endpoint |
|---|---|---|---|
| 2a | Sign in | `/login` | `POST /api/auth/login` |
| 3a | Sign in — invalid credentials | `/login` (error state) | `POST /api/auth/login` → 401 |
| 3b | Sign in — email not verified | `/login` (error state) | `POST /api/auth/login` → 403 |
| 3c | Sign in — account disabled | `/login` (error state) | `POST /api/auth/login` → 401 |
| 2b | Create account | `/register` | `POST /api/auth/register` |
| 3d | Create account — email taken | `/register` (error state) | `POST /api/auth/register` → 409 |
| 3e | Check your inbox | `/register/check-inbox` | (post-202 transitional screen) + `POST /api/auth/resend-verification` |
| 2c | Confirm your email | `/verify-email` (has token, unconfirmed) | — (button triggers verify call) |
| 3f | Email confirmed | `/verify-email` (status success) | `POST /api/auth/verify-email` → success |
| 3g | Link invalid/expired | `/verify-email` (status expired/invalid, or no token) | `POST /api/auth/verify-email` → expired/invalid + `POST /api/auth/resend-verification` |

Decisions locked in for this plan:
- **Token storage**: both `accessToken` and `refreshToken` in `localStorage`.
- **"Contact support" link** (3c): rendered but inert (`href="#"` or no-op) — no destination yet.
- **No forgot/reset-password** work included.

---

## Phase 1 — Design tokens & shared UI primitives

Build the visual foundation with no auth logic yet, so it can be reviewed purely on
look-and-feel against the mockup.

- Extend Tailwind theme: dark background (`#06080C`/`#0A0E14`), border color, accent
  color as a CSS variable (default `#3EDC97`), IBM Plex Sans + IBM Plex Mono fonts.
- Shared primitives in `src/components/`: `Button` (primary/outline variants),
  `TextField` (label + input, error-border state), `Card`, `Banner` (error/warning/success
  tinted variants), brand mark (diamond glyph + monospace "SCREENER" wordmark).
- Two layout shells: `SplitAuthLayout` (marketing panel + form card, used by
  login/register) and `CenteredAuthLayout` (header bar + centered content block, used
  by verify/inbox screens).
- Optional decorative bottom ticker strip component (static/mock data — real order
  book data doesn't exist yet, this is purely cosmetic per the design).
- **Reviewable as**: a couple of throwaway preview routes rendering the two layouts
  with placeholder content, checked visually against the mockup for spacing/type/color.

## Phase 2 — Auth API client & session store

Wire up the data layer with no pages yet.

- `src/lib/api/` fetch wrapper: base URL from `config`, JSON parsing, typed `ApiError`
  (`{ message, status, path }`).
- `src/features/auth/api.ts`: typed functions for all 7 endpoints (register,
  verify-email, resend-verification, login, refresh, logout, me), each with a Zod
  schema for its response.
- Session store (`src/features/auth/session.ts` or a small Zustand store): holds
  `accessToken`, `refreshToken`, `expiresIn`, derived expiry timestamp, and the
  hydrated `/me` profile (`accessState` etc.). Persists both tokens to `localStorage`.
- Proactive refresh scheduling (`expiresIn - 60s`) plus reactive refresh-on-401 for
  any authenticated call; a `401` from `/refresh` itself triggers hard logout (clear
  storage).
- **Reviewable as**: typecheck passes; no UI surface yet, but this phase can be
  sanity-checked with a scratch script/console calls against a running backend, or
  deferred and validated implicitly once Phase 5 lands.

## Phase 3 — Register + Check-inbox flow (2b, 3d, 3e)

- `/register` page: React Hook Form + Zod (first name, last name, email, password —
  12-char minimum per the design's placeholder hint). Submit → `POST /register`.
- On `202`: navigate to `/register/check-inbox` carrying the email (route state or
  query param), rendering screen 3e — "Didn't get it? Resend" wired to
  `resend-verification`, with a client-only cosmetic 60s button-disable timer (no
  server signal to key off, per the API doc).
- On `409`: inline error banner "This email is already registered — Sign in instead"
  (screen 3d), linking to `/login`.
- On `400`: shouldn't normally be reachable past client-side validation, but map the
  message through the same banner as a fallback.
- **Reviewable as**: full register → check-inbox loop testable end-to-end against a
  real or stubbed backend, independent of login/verify.

## Phase 4 — Verify-email flow (2c, 3f, 3g)

- `/verify-email` route reads `token` from the query string on mount.
- No token present → render invalid state (3g) immediately, no backend call.
- Token present → render "Confirm your email" (2c) with a Confirm button that does
  **not** auto-submit on mount (email-scanner safety per the API doc) — only fires
  `POST /verify-email` on click.
- Branch on response `status`:
  - `success` → 3f, "Go to sign in" → `/login`.
  - `expired` / `invalid` → 3g, with an email-entry form (no email is returned by
    this endpoint) wired to `resend-verification`.
- **Reviewable as**: independently testable by hitting `/verify-email?token=...` with
  valid/expired/invalid/missing tokens.

## Phase 5 — Login flow + error states (2a, 3a, 3b, 3c)

- `/login` page: RHF + Zod (email, password). Submit → `POST /login`.
- Success → store tokens in session store, fetch `/me`, route into the app (a
  placeholder authenticated route is fine since the rest of the app isn't built yet).
- `401 Invalid credentials` → generic red banner (3a), same message regardless of
  which field was wrong.
- `401 Account disabled` → red banner with inert "Contact support" link (3c).
- `403 Email not verified` → amber warning banner (3b) with inline "Resend
  verification email" button using the email already typed into the form (no
  additional prompt).
- **Reviewable as**: all four login states independently triggerable against the
  real backend (valid creds, wrong creds, disabled account, unverified account).

## Phase 6 — Session bootstrap, route guards, logout

Ties everything together into a working session lifecycle.

- App bootstrap: on load, if tokens exist in `localStorage`, call `/me` to hydrate
  (or attempt `/refresh` first if the access token looks expired); on any hard
  failure, clear storage and land on `/login`.
- `PublicRoute` (redirect away from `/login`/`/register` if already authenticated)
  and `ProtectedRoute` (redirect to `/login` if not) wrappers for future app routes.
- Logout action: `POST /logout` (best-effort) then always clear local storage and
  redirect to `/login`, per the doc's "idempotent, discard regardless of response"
  guidance.
- **Reviewable as**: refresh the page mid-session and confirm it stays logged in;
  let a token expire and confirm silent refresh; log out and confirm hard redirect.

## Phase 7 — Visual QA pass (polish)

- Side-by-side comparison of each of the 10 screens against the Claude Design mockup:
  spacing, copy accuracy (exact button/banner text), focus states, button
  loading/disabled states during in-flight mutations.
- Sanity-check keyboard/focus behavior and that error banners are announced
  (`aria-live`) since this is a form-heavy surface.
- Not a functional phase — purely a pixel/detail pass, reviewable as a screenshot diff
  against the design.

---

## Suggested review cadence

Each phase above is intended to land as its own PR/commit, in order — Phase 1 has no
logic to break, Phases 2 is invisible infra, and Phases 3–5 are the three
independently-testable user-facing flows. Phase 6 is the integration point and
Phase 7 is cleanup. This keeps every review small and gives you a working, testable
slice of the product at the end of each phase rather than one large auth PR.
