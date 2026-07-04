# Phase 3 — Register + Check-inbox flow (2b, 3d, 3e)

Parent plan: [`auth-templates-implementation.md`](./auth-templates-implementation.md) § Phase 3.
API contract: [`.claude/docs/auth-api.md`](../docs/auth-api.md) §3.1 (register), §3.3 (resend).
Design source: Claude Design project **Screener Authentication Templates**
(`Auth Pages.dc.html`, project id `1311c691-ada2-4d29-ab30-7ab9f335123a`), desktop templates
**2b** (register), **3d** (register → 409 email taken), **3e** (check your inbox).

**Goal**: ship the first user-facing auth flow — a `/register` page that submits to
`POST /api/auth/register`, and a `/register/check-inbox` screen (rendered after a 202) with a
cosmetic-cooldown "Resend" button wired to `POST /api/auth/resend-verification`. This is the first
of the three independently-testable flows; it does **not** depend on login (Phase 5) or verify
(Phase 4) existing. It consumes Phase 1 primitives/layouts and the Phase 2 API client — it adds the
first **mutation hooks** (Phase 2 deliberately left submit hooks to their pages).

---

## 1. Template analysis (values pulled from `Auth Pages.dc.html`, not estimated)

### 2b — Register (desktop, `SplitAuthLayout`)

- **Layout**: the existing `SplitAuthLayout` (marketing panel `flex:1.2` + right form panel `flex:1`
  centering a **400px** column). The right/form panel is reused as-is; the **left/marketing panel
  differs from the current hardcoded (login) content** and must be swapped for the 2b variant — see
  §2.6, which parameterizes `SplitAuthLayout` with a `marketing` slot.
- **2b marketing panel content** (distinct from the login/2a content Phase 1 hardcoded): headline
  `h2` "Your thresholds. Your tickers. Sub-second." (`38px/600`, `letter-spacing:-0.02em`,
  `line-height:1.15`, `--color-text`, `max-w-[580px]`); subtext `p` "Define custom classification
  rules per ticker and watch significant levels surface the moment they form." (`15px`,
  `line-height:1.6`, `--color-text-muted`, `max-w-[460px]`); then a **three-stat row** (`gap:40px`),
  each column mono `24px/600` value (`--color-text-strong`) over a `12px` `--color-text-muted` label:
  `500+` / "spot & futures tickers", `<1s` / "streaming latency", `7 days` / "free trial, no card".
  **No order-book preview card** in the 2b panel (that card belongs to the login/2a panel).
- **Form column** (`gap:24px`):
  - Header block (`gap:8px`): `h1` "Create account" (`26px/600`, `letter-spacing:-0.01em`,
    `--color-text`); subtitle `p` "Free 7-day trial. No card required." (`14px`, `line-height:1.55`,
    `#C2CBD9` ≈ `--color-text-secondary`).
  - Fields block (`gap:18px`):
    - **Two-column row** (`grid-template-columns:1fr 1fr; gap:14px`): **First name** (`placeholder="Ada"`)
      and **Last name** (`placeholder="Lovelace"`).
    - **Email** (full width, `type="email"`, `placeholder="ada@example.com"`).
    - **Password** (full width, `type="password"`, `placeholder="At least 8 characters"` — note the
      mockup reads "At least 12 characters"; we intentionally lower the minimum to **8**, see §2.7).
    - Labels are the uppercase-mono `TextField` label style already in the primitive.
  - **Primary button** full-width "Create account" (`15px/600`, `bg-accent`, `text-accent-ink`).
  - Footer `p`, centered: "Already have an account? **Sign in**" — the link points at `/login`
    (Phase 5 route; renders now, target lands later — see §2.5 concern).

### 3d — Register error state (email taken 409 **and** short-password client check)

This template is the register form's **top error-banner treatment**. In this phase it is driven by
**two** distinct triggers (see §2.7 for the password decision):

1. **409 email taken** (server) — Banner text **"This email is already registered."** + a **"Sign in
   instead"** link to `/login`, and the **email** field's border tinted danger.
2. **Short password** (client, < 8 chars) — same banner slot/treatment, Banner text **"Password must
   be at least 8 characters long"**, and the **password** field's border tinted danger.

Shared mechanics:
- Error **Banner** (`variant="error"`) sits between the header block and the fields block. Its colors
  already match Phase 1's `Banner` `error` variant (`color-mix` of `--color-danger` at 10% bg / 38%
  border) — no new styling needed. (Design tints the "Sign in instead" link `#F5C0C0`; render it as a
  normal in-banner accent/danger `<Link>`.)
- The design shows the offending input's **border tinted danger**
  (`color-mix(in oklab, #F26D6D 45%, transparent)`) with **no per-field message text** — the banner
  carries the copy. Phase 1's `TextField` tints its border whenever `error` is truthy **but also
  renders an inline `<p>` with that text**. To get border-only tinting (matching the mockup) the
  cleanest fix is a tiny `TextField` enhancement: add an `invalid?: boolean` prop that tints the
  border without rendering the inline `<p>` (distinct from `error?: string`, which keeps its inline
  message for the plain field-validation cases). Pass `invalid` to the email field on 409 and to the
  password field on the short-password check. (Alternative if we want zero primitive changes: pass a
  single space as `error` — tints the border but leaves a blank `<p>`; the `invalid` prop is cleaner
  and is the recommendation.)
- The 409 is a submit-time server error (lives in page state, keyed off `ApiError.status`); the
  password-length error is a client check surfaced into the **same** banner slot rather than as an
  inline field error — so the register form has exactly one top-of-form banner fed by either trigger.

### 3e — Check your inbox (desktop, `CenteredAuthLayout`)

- **Layout**: the existing `CenteredAuthLayout` (header bar with `BrandMark` + centered **440px**
  column). Already built in Phase 1 — reuse verbatim.
- **Content column** (`gap:24px`, centered, `text-align:center`):
  - **`@` glyph badge**: `60×60` circle, `border` + `bg` are `color-mix` of `--color-accent`
    (45% border / 10% bg), mono `23px` accent `@`. (Phase 1's `/dev/centered-preview` already
    prototyped this exact element — lift that markup.)
  - Header block (`gap:10px`): `h1` "Check your inbox" (`28px/600`); `p` (`14px`, `line-height:1.6`,
    `#C2CBD9`): "We sent a verification link to" / **`<the email>`** (`--color-text-strong`, `500`) /
    "The link is valid for 24 hours." — three lines separated by `<br>`.
  - Resend block (`gap:8px`, centered, full width):
    - **Outline button** "Didn't get it? Resend" (`padding:11px 20px`, `font-size:14px`, **not**
      full-width — `fullWidth={false}`).
    - Sub-caption mono `11px` `--color-text-dim`: "resend available once per 60 s".
  - Footer link "Back to sign in" → `/login` (Phase 5).

**Deliberate deviations from the raw mockup** (consistent with Phase 1's stated approach):
- The mockup's `style-hover` / `style-focus` pseudo-attributes are not real CSS; real `:hover`,
  `transition`, and `:focus-visible` behavior already live in the Phase 1 primitives (`Button`,
  `TextField`) and are inherited automatically.
- The `@` badge is not yet a shared primitive. It appears only on this screen in this phase, so build
  it inline in the page (do **not** prematurely extract a component). If Phase 4's verify screens want
  a similar badge, extraction can happen then.

---

## 2. Decisions & concerns (addressed, with recommended defaults)

These are the points where the parent plan left a choice open or where the templates/API interact in
a way worth calling out. Items 3 (cooldown-on-click), 6 (marketing panel), and 7 (8-char password)
were **confirmed by the product owner** and are now locked, not open questions.

1. **How the email reaches the check-inbox screen.** `/register/check-inbox` needs the email to
   display (3e) and to resend with. Options: (a) React Router **location state**
   (`navigate('/register/check-inbox', { state: { email } })`), (b) a **query param**
   (`?email=`). 
   **Recommendation (a) + a guard**: pass via location `state`, and if a user lands on the route
   with no state (hard refresh, direct nav, bookmarked), **redirect to `/register`** rather than
   showing an emailless screen. Rationale: the email is transient post-submit UI state, not a
   shareable/bookmarkable address; a query param would put the address in browser history/URL for no
   benefit and let people deep-link a "we emailed X" screen for an arbitrary X. The redirect-on-missing
   guard keeps the refresh case sane. **Use the server-normalized `response.email`** from the 202 body
   (lowercased) for both display and resend — not the raw typed value — per the API doc's §3.1 note.

2. **Which email to resend from 3e.** The one carried in location state (the normalized 202 email).
   No re-prompt — this is the post-register path where we already know the address (contrast with the
   verify page's expired/invalid path in Phase 4, which has no email and must ask).

3. **Cosmetic resend cooldown.** The backend gives no cooldown signal (always 202), so the ~60s
   disable is **client-cosmetic only**, per the API doc §3.3. Build it as a small reusable hook
   `useCooldown(seconds)` in the auth feature (Phase 4's verify-resend and Phase 5's login-403 resend
   both need the identical behavior — a single hook now avoids three copies, and it's ~15 lines, not
   speculative). The hook returns `{ remaining, active, start() }`; the button is `disabled` while
   `active` and the caption shows `remaining`. **Locked (confirmed):** start the cooldown **on click**
   — before/independent of the response — so rapid double-clicks are prevented even while the first
   request is in flight; the request still fires once per click regardless.

4. **Mutation hooks vs. raw calls.** Phase 2 left submit hooks to their pages. Add `useRegister` and
   `useResendVerification` as thin **`useMutation`** wrappers (TanStack Query is already provisioned)
   so pages get `isPending` / `isError` / `error` for free to drive button loading + disabled state
   and the 409 banner. Place them in `src/features/auth/queries.ts` alongside `useMe` (keeps every
   React-Query hook in the one React-facing auth file, consistent with Phase 2's layering — the core
   `api.ts`/`session.ts` stay React-free). Neither mutation touches the session store or the `/me`
   cache: register issues no tokens, resend returns nothing to cache.

5. **Links to not-yet-built routes.** "Sign in" (2b footer, 3d banner) and "Back to sign in" (3e) all
   target `/login`, which arrives in Phase 5. They render now; until Phase 5 the app's catch-all
   `<Route path="*" element={<Navigate to="/" replace />} />` will bounce `/login` to `/`. Acceptable
   for an isolated Phase 3 review — the links are correct and become live in Phase 5 with no rework.
   Use a router `<Link>` (not a raw `<a>`) so they're SPA navigations.

6. **Marketing-panel content is per-page — `SplitAuthLayout` gets a `marketing` slot (confirmed).**
   Phase 1's hardcoded left-panel content ("Every level that matters, in real time." + the order-book
   preview card) is **correct — it is the login/2a panel** (login isn't built until Phase 5, which is
   why it looked like drift). Register (2b) needs a **different** left panel: the stats variant
   described in §1 (headline "Your thresholds. Your tickers. Sub-second." + subtext + the `500+` /
   `<1s` / `7 days` stat row, and **no** order-book card).
   **Resolution**: parameterize `SplitAuthLayout` with an optional `marketing?: ReactNode` slot that
   replaces only the **centered middle content block** of the left panel (the `BrandMark` at top and
   the `TickerStrip` at bottom stay structural in the layout). When omitted, it renders the existing
   login content as the default — so Phase 5's login page keeps working with zero args and no churn.
   Register passes `marketing={<RegisterMarketing />}` (a new small component, §4). This is a small,
   backward-compatible refactor, not a rewrite — see §4.6.

7. **Validation rules (client-side, RHF + Zod). Password minimum = 8, confirmed.** Mirror the
   backend's "all fields required, non-blank":
   - `firstName`, `lastName`: `.trim().min(1)` ("required").
   - `email`: `z.email()` (client-side format guard; backend lowercases server-side).
   - `password`: `.min(8, 'Password must be at least 8 characters long')` — **overriding the mockup's
     12** at the product owner's direction. **FYI locked in:** the backend enforces **no** password
     length at all, so this 8-char floor is a **purely client-side UX guard**, not a contract mirror;
     a request with a shorter password would succeed server-side if it bypassed the client.
   - **Presentation of the short-password error (confirmed):** surface it using the **3d error-banner
     treatment** — the top `Banner variant="error"` with text "Password must be at least 8 characters
     long" plus the password field's border tinted danger — **not** as a plain inline field message.
     (The required/email-format errors remain ordinary inline `TextField` messages; only the
     password-length error is elevated to the banner, per the instruction. See §1 "3d" and §4.4.)
   The backend `400 "All fields are required"` should essentially never be reachable past this client
   validation, but map its `message` through the same top banner as a fallback rather than swallowing it.

---

## 3. Files to create / modify

```
src/
  components/
    TextField.tsx          # MODIFY — add `invalid?: boolean` (border-only danger tint, no inline <p>)
    layouts/
      SplitAuthLayout.tsx  # MODIFY — add optional `marketing?: ReactNode` slot; default = current login content
  features/
    auth/
      validation.ts        # NEW — Zod register form schema (password min 8) + RegisterFormValues
      queries.ts           # MODIFY — add useRegister, useResendVerification alongside useMe
      hooks/
        useCooldown.ts     # NEW — reusable cosmetic countdown timer (Phases 4/5 reuse it)
      components/
        RegisterMarketing.tsx # NEW — 2b left-panel content (headline + subtext + 3-stat row)
      pages/
        RegisterPage.tsx   # NEW — /register (2b + 3d error states: 409 + short-password)
        CheckInboxPage.tsx # NEW — /register/check-inbox (3e)
      index.ts             # MODIFY — re-export the two pages + new hooks/types as needed
  App.tsx                  # MODIFY — add /register + /register/check-inbox; remove /dev/split-preview
```

Notes on placement:
- New `pages/`, `hooks/`, and `components/` subdirs under `features/auth/` — the feature is about to
  grow several screens (Phases 4–5), so give it structure now instead of a flat pile. `queries.ts`,
  `api.ts`, `session.ts`, `schemas.ts` stay at the feature root as the data layer.
- `validation.ts` (form schemas) is separate from `schemas.ts` (API response schemas) so the two
  Zod concerns don't tangle — one validates user input, the other validates server output.
- `RegisterMarketing` lives under `features/auth/components/` (it's auth-page-specific content, not a
  generic primitive). The **login** marketing content stays as the layout's built-in default for now;
  Phase 5 can extract a matching `LoginMarketing` if it wants symmetry, but Phase 3 doesn't touch it.
- `SplitAuthLayout` and `TextField` are shared primitives from Phase 1; the two modifications are
  **additive and backward-compatible** (a new optional prop each), so nothing already using them
  breaks.

---

## 4. Implementation detail

### 4.1 `src/features/auth/validation.ts`

```ts
import { z } from 'zod';

export const registerFormSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required'),
  lastName:  z.string().trim().min(1, 'Last name is required'),
  email:     z.email('Enter a valid email'),   // zod v4 top-level format (z.string().email() is deprecated in v4)
  password:  z.string().min(8, 'Password must be at least 8 characters long'),  // 8 per product owner; NO backend enforcement
});

export type RegisterFormValues = z.infer<typeof registerFormSchema>;
```

`z.email()` on an empty string yields the format message; if a distinct "Email is required" is
wanted for the blank case, use `z.string().trim().min(1, 'Email is required').pipe(z.email('Enter a
valid email'))`.

RHF wires this via `@hookform/resolvers/zod`'s `zodResolver`. **Confirmed prerequisite**: neither
`react-hook-form` nor `@hookform/resolvers` is in `package.json` yet (Phases 1–2 introduced no forms),
so the **first step of Phase 3 is** `npm i react-hook-form @hookform/resolvers`. The project is on
**Zod v4** (`^4.4.3`), so use the v4 top-level string formats (`z.email()`) rather than the
deprecated `.email()` chained method, and confirm the installed `@hookform/resolvers` version is one
that targets Zod 4 (v3.10+/v5).

### 4.2 `src/features/auth/queries.ts` (additions)

```ts
// alongside the existing useMe()
export function useRegister() {
  return useMutation({
    mutationFn: (body: RegisterRequest) => api.register(body),
    // returns { status, email } on 202; email is server-normalized
  });
}

export function useResendVerification() {
  return useMutation({
    mutationFn: (body: ResendRequest) => api.resendVerification(body),
    // always 202 generic; success just means "request accepted"
  });
}
```

- No `onSuccess` cache writes — neither endpoint feeds the `/me` cache or the session store.
- Pages read `mutation.isPending` (button loading/disabled), `mutation.error` (an `ApiError` — branch
  on `.status`), and `mutation.mutateAsync(...)` for the submit.

### 4.3 `src/features/auth/hooks/useCooldown.ts`

```ts
export function useCooldown(seconds: number) {
  const [remaining, setRemaining] = useState(0);
  const start = useCallback(() => setRemaining(seconds), [seconds]);
  useEffect(() => {
    if (remaining <= 0) return;
    const id = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(id);
  }, [remaining]);
  return { remaining, active: remaining > 0, start };
}
```

Purely cosmetic; no persistence across reloads (a refresh clears it — acceptable, since the server
enforces the real 60s throttle regardless).

### 4.4 `src/features/auth/pages/RegisterPage.tsx`

- `useForm<RegisterFormValues>({ resolver: zodResolver(registerFormSchema) })`.
- Render inside `<SplitAuthLayout marketing={<RegisterMarketing />}>` (the 2b left panel, §4.7); form
  column mirrors 2b (header, optional top banner, `gap:18px` fields, primary button, footer link).
- First/Last name in a `grid grid-cols-2 gap-[14px]` wrapper (two `TextField`s — the primitive is a
  `flex-col` so it drops into a grid cell cleanly). Register each field with RHF `register('...')`.
- **Error surfacing — one top banner, two input-tint targets.** Compute a single `topError` for the
  3d-style `Banner variant="error"` slot (rendered between header and fields) with this priority:
  1. **Submit `ApiError`** (from a rejected `mutateAsync`, held in local `submitError` state):
     - `409` → "This email is already registered." + `<Link to="/login">Sign in instead</Link>`, and
       set `invalid` on the **email** `TextField`.
     - `400` / anything else → show `err.message` (backend copy is user-safe).
  2. **Client short-password error** (`errors.password`) → "Password must be at least 8 characters
     long", and set `invalid` on the **password** `TextField`. (This is the §2.7-confirmed elevation
     of the password-length error into the banner.)
  - `firstName` / `lastName` / `email`-format errors stay as **inline** `TextField` messages via
    `error={errors.x?.message}` — they are *not* routed to the banner. (Do **not** also pass
    `error={errors.password?.message}` to the password field; its message goes to the banner and its
    border is tinted via the new `invalid` prop instead — see §4.8 `TextField` change.)
- `const registerMut = useRegister();`
- On submit (`handleSubmit` only fires when client validation passes, so a short password never
  reaches the network):
  ```
  try {
    const res = await registerMut.mutateAsync(values);   // throws ApiError on non-2xx
    navigate('/register/check-inbox', { state: { email: res.email } });  // server-normalized email
  } catch (err) {
    if (err instanceof ApiError) setSubmitError(err);     // drives the 409/400 banner branch
  }
  ```
- Primary button: `disabled={registerMut.isPending}`, label swaps to a pending affordance
  ("Creating account…" — the `Button` has no loading prop yet; a disabled + text swap is simplest.
  Adding a spinner prop to `Button` is optional Phase 7 polish).
- Footer: `Already have an account? <Link to="/login">Sign in</Link>`.

### 4.5 `src/features/auth/pages/CheckInboxPage.tsx`

- Read `email` from `useLocation().state`. If absent → `<Navigate to="/register" replace />` (guard
  from §2.1).
- Render inside `<CenteredAuthLayout>`; content column mirrors 3e (the `@` badge, header with the
  email interpolated, resend block, back-to-sign-in link).
- `const resendMut = useResendVerification(); const cooldown = useCooldown(60);`
- Resend button (`Button variant="outline" fullWidth={false}`): `disabled={cooldown.active ||
  resendMut.isPending}`. On click:
  ```
  cooldown.start();                                  // cosmetic, on click (§2.3)
  resendMut.mutate({ email });                        // fire-and-forget; always 202
  ```
  Because the response is deliberately indistinguishable, show a **generic** confirmation regardless
  of outcome — e.g. once `resendMut.isSuccess`, swap the caption to "Sent — check your inbox again"
  (still cosmetic). Do **not** try to detect existence/cooldown/verified state from the response.
- Caption line: while `cooldown.active`, show "resend available in {remaining} s"; otherwise the
  static "resend available once per 60 s" from the mockup.
- "Back to sign in" → `<Link to="/login">`.

### 4.6 `src/components/layouts/SplitAuthLayout.tsx` (add `marketing` slot)

- Add an optional prop: `marketing?: ReactNode`.
- The left panel's centered middle block (currently the hardcoded headline + subtext + order-book
  preview card, inside `<div className="flex flex-1 flex-col justify-center gap-8">…</div>`) becomes:
  render `{marketing}` inside that same centering wrapper when the prop is provided, else render the
  existing default content unchanged.
- `BrandMark` (top) and `TickerStrip` (bottom) stay exactly where they are — the slot only swaps the
  middle content, so vertical rhythm (`justify-between` column, `gap-8` inside the centered block) is
  identical for both variants.
- **Backward-compatible**: existing/no-arg callers (the future login page, any remaining preview)
  keep the default login panel; only register passes `marketing`.

### 4.7 `src/features/auth/components/RegisterMarketing.tsx` (2b left panel)

Renders the two children the layout's centered block expects (headline block, then stats row):

- Headline block (`flex flex-col gap-[14px]`): `h2` "Your thresholds. Your tickers. Sub-second."
  (`text-[38px] font-semibold leading-[1.15] tracking-[-0.02em] text-text max-w-[580px]`); `p`
  "Define custom classification rules per ticker and watch significant levels surface the moment they
  form." (`text-[15px] leading-[1.6] text-text-muted max-w-[460px]`).
- Stats row (`flex gap-10`), three columns, each `flex flex-col gap-1`:
  - `500+` (`font-mono text-[24px] font-semibold text-text-strong`) / "spot & futures tickers"
    (`text-[12px] text-text-muted`)
  - `<1s` / "streaming latency"
  - `7 days` / "free trial, no card"
- No order-book card (that's login/2a only).

### 4.8 `src/components/TextField.tsx` (add `invalid` prop)

- Add `invalid?: boolean` to the props. Border tints danger when **either** `error` (string) **or**
  `invalid` (boolean) is truthy: `error || invalid ? 'border-danger' : 'border-border-input'`.
- The inline `<p>` message still renders **only** when `error` is a non-empty string (unchanged).
- Net effect: `invalid` gives the 3d "tinted border, no inline text" state (used for the email field
  on 409 and the password field on the short-password banner), while `error` keeps the ordinary
  "tinted border + inline message" behavior for firstName/lastName/email-format. Purely additive.

### 4.9 `src/App.tsx` (routing)

- Add `<Route path="/register" element={<RegisterPage />} />` and
  `<Route path="/register/check-inbox" element={<CheckInboxPage />} />`.
- **Remove** the `/dev/split-preview` route and its `SplitPreview` component — the real `/register`
  now exercises `SplitAuthLayout`, so the throwaway split preview has served its purpose (per Phase
  1's "deleted once Phase 3–5 replace them"). **Keep** `/dev/centered-preview` for now; Phase 4's
  verify pages replace it. Keep the `Placeholder` root and catch-all redirect.

---

## 5. Verification

- `npm run typecheck` and `npm run build` pass.
- `npm run dev`, then exercise against a running backend (`VITE_DEV_PROXY_TARGET` pointed at it) — or
  the Vite proxy default `localhost:8080`:
  - Visit `/register`. Confirm the **left panel shows the 2b content** (headline "Your thresholds…" +
    the `500+` / `<1s` / `7 days` stat row, no order-book card). Compare 2b against the mockup for
    spacing/type/color.
  - Client validation: submit empty → firstName/lastName/email show **inline** required errors; a
    **password of 1–7 chars** → the **3d top banner** reads "Password must be at least 8 characters
    long" and the password field border tints danger (no inline password message); an 8+ char
    password passes that check; bad email format → inline email error.
  - Register a **fresh** email (valid, 8+ char password) → redirect to `/register/check-inbox` showing
    the normalized email; the `@` badge + copy match 3e.
  - On check-inbox, click **Resend** → button disables ~60s (cooldown starts on click), caption counts
    down, request fires (202); a generic confirmation shows regardless of outcome.
  - Register an **already-registered** email → stays on `/register`, 3d banner "This email is already
    registered." appears, **email** field border tints danger, "Sign in instead" link present.
  - Hard-refresh `/register/check-inbox` (no location state) → redirects to `/register` (guard).
- Manual a11y sanity: tab order through the form is logical; the submit-error `Banner` is reachable
  and legible (full `aria-live` announcement is a Phase 7 item).

## 6. Out of scope (belongs to later phases — do not pull in)

- Login page and its error states (2a/3a/3b/3c) — Phase 5. `/login` links render but the route is not
  built here.
- Verify-email flow (2c/3f/3g) — Phase 4. The `useCooldown` hook and (if extracted later) the `@`
  badge are built here in a reusable shape but their verify-page usage is Phase 4's work.
- Session bootstrap, route guards, `PublicRoute` redirect-away-when-authenticated — Phase 6. Phase 3's
  pages are reachable regardless of auth state; a logged-in user visiting `/register` is a Phase 6
  guard concern.
- The **login** marketing panel: it stays as `SplitAuthLayout`'s built-in default (it *is* the
  correct 2a content). Extracting a symmetric `LoginMarketing` component is a Phase 5 nicety, not a
  Phase 3 task.
- Any spinner/loading-prop addition to the `Button` primitive — optional Phase 7 polish.

## 7. Commit

Single commit, e.g. `Add register + check-inbox flow (Phase 3)` — new register/check-inbox pages, the
`RegisterMarketing` panel, form validation (password min 8), the two mutation hooks, and the cooldown
hook; additive `marketing` slot on `SplitAuthLayout` and `invalid` prop on `TextField`; routing
updated; the `/dev/split-preview` scaffold removed. (`react-hook-form` + `@hookform/resolvers` added
to `package.json` as the first step.)
```
