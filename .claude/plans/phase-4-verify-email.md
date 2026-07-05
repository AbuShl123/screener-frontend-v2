# Phase 4 — Verify-email flow (2c, 3f, 3g)

Parent plan: [`auth-templates-implementation.md`](./auth-templates-implementation.md) § Phase 4.
API contract: [`.claude/docs/auth-api.md`](../docs/auth-api.md) §3.2 (verify-email), §3.3 (resend), §2
(the account-lifecycle / email-scanner rationale).
Design source: Claude Design project **Screener Authentication Templates**
(`Auth Pages.dc.html`, project id `1311c691-ada2-4d29-ab30-7ab9f335123a`), desktop templates
**2c** (confirm your email), **3f** (email confirmed), **3g** (link invalid/expired + resend form).

**Goal**: ship the second independently-testable auth flow — a single `/verify-email` route that reads
`?token=` from the URL, shows a **Confirm** button that does **not** auto-submit (email-scanner safety),
POSTs to `POST /api/auth/verify-email` only on click, and branches the resulting `status` into the
success (3f) and expired/invalid (3g) screens — the latter carrying an email-entry resend form wired to
`POST /api/auth/resend-verification`. It reuses the Phase 1 `CenteredAuthLayout` + primitives, the Phase 2
API client/`verifyEmail` function/`verifyEmailResponseSchema`, and the Phase 3 `useCooldown` hook +
`useResendVerification` mutation. It does **not** depend on login (Phase 5) or the session/token layer —
verify issues no tokens.

---

## 1. Template analysis (values pulled from `Auth Pages.dc.html`, not estimated)

All three screens use the **`CenteredAuthLayout`** shell (header bar with `BrandMark` + a centered
`w-[440px]` column) — already built in Phase 1 and reused verbatim by Phase 3's check-inbox. The design's
column is `440px` wide; `CenteredAuthLayout` already centers a `w-[440px]` block, so the layout is a
drop-in for all three states. `showTicker` stays `false` (Phase 3 precedent; the `sc-if` ticker in the
mockup is optional/decorative).

### 2c — Confirm your email (the token-present, not-yet-confirmed state)

- **Column**: `flex flex-col gap-6 items-center text-align:center` (`gap:24px`, centered).
- **No badge/glyph** on this screen (contrast 3f/check-inbox, which have one). Just:
  - Header block (`flex flex-col gap-[10px]`): `h1` "Confirm your email" (`text-[28px] font-semibold
    tracking-[-0.01em] text-text`); `p` (`text-[14px] leading-[1.6] text-text-secondary`): "You're one
    click away. Confirm to activate" `<br>` "your account and start screening." (two lines via `<br>`).
  - **Primary button**, full-width: "Confirm email".
  - Sub-caption mono `11px` `text-text-dim`: "this link is single-use".

### 3f — Email confirmed (verify → `status: "success"`)

- **Column**: identical shape to 2c (`gap:24px`, centered, `text-align:center`).
  - **✓ badge**: the same `60×60` circle as check-inbox's `@` badge — `border` `color-mix(accent 45%)`,
    `bg` `color-mix(accent 10%)`, mono/large glyph accent-colored — but the glyph is **✓** at
    `font-size:25px` (check-inbox's `@` is `23px`). This is the second use of that badge → **extract it**
    (see §2.2).
  - Header block (`gap:10px`): `h1` "Email confirmed" (`28px/600`); `p` (`14px/1.6 text-text-secondary`):
    "Your account is verified." `<br>` "Sign in to start screening."
  - **Primary button**, full-width: "Go to sign in" → `/login`. (Mockup renders it as an `<a href="#2a">`;
    we render a router `<Link>`/`Button` to `/login`. Do **not** auto-login — verify issues no tokens.)
  - No sub-caption.

### 3g — This link is invalid or has expired (verify → `expired` | `invalid`, **or** no token in URL)

- **Column**: `flex flex-col gap-6` — **left-aligned** (note: unlike 2c/3f, this state has **no**
  `items-center`/`text-align:center`, because it contains a form). Width `440px` from the layout.
  - Header block (`gap:10px`): `h1` "This link is invalid or has expired" (`28px/600`,
    `text-wrap:pretty`); `p` (`14px/1.6 text-text-secondary`): "Verification links last 24 hours and work
    once. Enter your email and we'll send a fresh one."
  - **Email field** (`TextField`, `type="email"`, `placeholder="ada@example.com"`, label "Email").
  - **Primary button**, full-width: "Send new link".
  - Caption mono `11px` `text-text-dim`, centered in the mockup: "if an unverified account exists, a link
    will be sent" (anti-enumeration copy — see §2.5 for how the cooldown/"sent" states layer onto it).

**Single screen for both `expired` and `invalid`.** The mockup collapses them into one 3g layout with the
copy "This link is invalid or has expired" — matching the API doc, which says both are normal, expected
outcomes needing the same resend affordance. So the page never needs to distinguish `expired` from
`invalid`; both (and the no-token case, and any unexpected status caught to `invalid` by
`verifyEmailResponseSchema`) route to the identical 3g render.

**Deliberate deviations from the raw mockup** (consistent with Phases 1–3):
- The mockup's `style-hover`/`style-focus` pseudo-attributes aren't real CSS — real `:hover`/`transition`/
  `:focus-visible` already live in the Phase 1 `Button`/`TextField` primitives and are inherited.
- The badge becomes a shared component (§2.2) rather than a third inline copy.

---

## 2. Decisions & concerns (addressed, with recommended defaults)

### 2.1 Page structure: one route, three states derived from the mutation — not a separate state machine

`/verify-email` is a **single page component** rendering one of three states. Rather than a hand-rolled
`useState` machine, **derive** the current state from the token presence + the `useVerifyEmail` mutation's
own status (`isIdle`/`isPending`/`isSuccess`/`isError` + `data`). This is the least-moving-parts option and
mirrors how `RegisterPage` already leans on its mutation's `isPending`:

```
const token = (searchParams.get('token') ?? '').trim();

if (!token)                                     → 3g (invalid, no backend call)      // §2.3
else if (verifyMut.isSuccess && data.status === 'success')   → 3f
else if (verifyMut.isSuccess /* expired | invalid */)        → 3g
else if (verifyMut.isError)                     → 2c + inline error banner (retry)   // §2.4
else                                            → 2c (idle, or isPending → button disabled/"Confirming…")
```

No `useEffect`, no local status state — the mutation object is the single source of truth. (An explicit
`useReducer`/state enum is the alternative; it's more ceremony for no gain here since every transition is
already reflected in the mutation state. Recommendation: derive.)

### 2.2 Extract the badge into a shared `AuthBadge` component (the Phase 3 "extract later" trigger)

Phase 3 built the check-inbox `@` badge **inline** and explicitly deferred extraction: *"If Phase 4's
verify screens want a similar badge, extraction can happen then."* 3f now needs the identical circle with a
`✓`. That's the trigger — extract now rather than paste a third copy.

- **New** `src/features/auth/components/AuthBadge.tsx`: a `60×60` circle with the accent
  border/bg `color-mix`, rendering a passed glyph. Props: `children` (the glyph) and an optional
  `className` to tune glyph size (check-inbox `@` = `text-[23px]`, 3f `✓` = `text-[25px]`).

  ```tsx
  export function AuthBadge({ children, className = '' }: { children: ReactNode; className?: string }) {
    return (
      <div
        className={`flex h-[60px] w-[60px] items-center justify-center rounded-full font-mono text-accent ${className}`}
        style={{
          border: '1px solid color-mix(in oklab, var(--color-accent) 45%, transparent)',
          background: 'color-mix(in oklab, var(--color-accent) 10%, transparent)',
        }}
      >
        {children}
      </div>
    );
  }
  ```

- **Refactor** `CheckInboxPage.tsx` to use `<AuthBadge className="text-[23px]">@</AuthBadge>` in place of
  its inline badge `<div>`. This is a small, behavior-preserving cleanup that pays for the extraction (two
  call sites now, not one). 3f uses `<AuthBadge className="text-[25px]">✓</AuthBadge>`.
  - *Concern flagged*: this touches a Phase 3 file. It's a pure refactor (same rendered markup), keeps the
    review boundary honest, and removes duplication the moment it appears. If the reviewer prefers Phase 4
    to leave Phase 3 code untouched, the fallback is to build `AuthBadge`, use it only in 3f, and leave
    check-inbox's inline copy — but then two near-identical badges coexist, which is worse. **Recommend the
    refactor.**

### 2.3 No-token case → 3g immediately, zero backend calls

If `?token=` is absent/blank (user navigated to `/verify-email` directly, or the link was mangled), render
3g **without** calling `verifyEmail` — there is nothing to verify. The API doc §2 point 5 calls this out
explicitly ("If no `token` param is present at all… show an invalid state without calling the backend").
The 3g resend form is fully functional in this case (it only needs an email the user types).

### 2.4 The verify endpoint "always 200" — but handle a genuine transport failure anyway

Per the contract, `verify-email` **always** returns `200` with a `status` field; `expired`/`invalid` are
*not* HTTP errors. So the happy path never rejects — `verifyMut` resolves and we branch on `data.status`.

But a **network drop, 5xx, or proxy error** will still make `request()` throw an `ApiError` (or a fetch
`TypeError`), surfacing as `verifyMut.isError`. That is **not** an invalid token, so routing it to 3g would
be misleading ("your link is bad" when actually the server hiccupped). **Recommendation**: on
`verifyMut.isError`, stay on the **2c** screen and show an inline `Banner variant="error"` — "Something went
wrong. Please try again." — with the Confirm button re-enabled so the user can retry the same token (it was
never consumed, since the POST didn't complete). This keeps the single-use token intact for a real retry.
`useMutation` resets `isError`/`isSuccess` automatically on the next `mutate`, so a retry cleanly
re-enters the flow. *(Flagging this because the plan's one-liner "branch on status" glosses over the
transport-failure branch; it's a real edge the page must not mis-render.)*

### 2.5 The 3g resend form — reuse `useResendVerification` + `useCooldown`, prompt for email

The 3g resend is the verify-page counterpart of check-inbox's resend, with **one difference**: the verify
endpoint never receives an email, so on `expired`/`invalid` (and no-token) we **don't know whose link this
was** — the form must **ask the user to type their email** (API doc §3.2 "expired/invalid has no email to
prefill"). This is the opposite of check-inbox, which already has the normalized 202 email.

- **Where does a successful "Send new link" go? Stay on 3g in place — do NOT navigate to
  `/register/check-inbox`.** Four reasons: (a) **anti-enumeration** — check-inbox asserts *"We sent a
  verification link to X"* definitively, whereas resend-verification returns an identical 202 whether or not
  the account exists; the 3g caption's hedged *"if an unverified account exists, a link will be sent"* is the
  correct claim for this path. (b) **Email mismatch** — check-inbox was built around the server-normalized
  email from the register 202; resend echoes **no email back**, so we'd only have the raw typed value. (c)
  **Design intent** — 3g ships its own in-place sent-state caption and a resendable form; the designer built
  for in-place feedback, not a redirect. (d) **Typo recovery** — staying in place keeps the email field
  editable so a user who mistyped can correct and resend; a navigation would strand them on a "we sent it to
  X" screen for the wrong X. Feedback is therefore purely the cosmetic caption swap (§2.5 below) — no route
  change. This is precisely **why the 60s cooldown on "Send new link" is required**: with no navigation away,
  the cooldown (plus `isPending`) is what prevents spam-clicking the same in-place button.
- Reuse the existing `useResendVerification` mutation and the `useCooldown(60)` hook (both built in Phase 3
  — no new hooks needed).
- **Email input**: wire with React Hook Form + a tiny one-field Zod schema (`resendFormSchema`, §4.1) for a
  format guard and an inline error, consistent with how `RegisterPage` validates. On submit:
  ```
  cooldown.start();                 // cosmetic, on click (§2.5, same as check-inbox)
  resendMut.mutate({ email });      // always 202; outcome deliberately opaque
  ```
- **Button** ("Send new link", primary, full-width): `disabled={cooldown.active || resendMut.isPending}`;
  label swaps to "Sending…" while pending (disabled + text swap, matching `RegisterPage` — the `Button`
  primitive still has no loading prop; that's optional Phase 7 polish).
- **Caption** (mono `11px text-text-dim`, centered): layer the three states onto the mockup's copy —
  - idle → the mockup's static anti-enumeration line "if an unverified account exists, a link will be sent";
  - `cooldown.active` → "resend available in {remaining} s";
  - else once `resendMut.isSuccess` → "Sent — check your inbox".
  As in Phase 3, **do not** try to infer sent/not-sent/verified/cooldown from the response — it's identical
  by design; the confirmation is purely cosmetic.

### 2.6 Double-submit / email-scanner safety (the core reason this flow exists)

- **No auto-submit on mount.** The `verifyEmail` POST fires **only** from the Confirm button's `onClick` —
  never in a `useEffect`/on render. This is the whole point of the design (API doc §2): link scanners
  pre-fetch the URL, so a human-initiated POST is required to consume the single-use token.
- **Guard the double-click.** The API doc §3.2 notes a double-click of Confirm consumes the token on the
  first POST and returns `invalid` on the second. Disable the Confirm button while `verifyMut.isPending`
  (and it naturally leaves the 2c screen on success/expired/invalid), so a second POST can't fire from the
  same click burst. `useMutation` is not idempotent by itself — the `disabled` guard is what prevents the
  self-inflicted `invalid`.

### 2.7 Links to `/login` (3f "Go to sign in", and any "back to sign in")

`/login` is a Phase 5 route. As in Phase 3, the `<Link to="/login">` renders now and becomes live in Phase
5 with no rework; until then the app catch-all `<Route path="*" element={<Navigate to="/" replace />}>`
bounces `/login` to `/`. Use a router `<Link>` (SPA nav), not a raw `<a>`. 3f's primary CTA can be a
`<Link>` styled as the primary button, or a `<Button>` with an `onClick={() => navigate('/login')}` — either
is fine; recommend the `<Link>` for correct semantics (it's navigation, not an action).

### 2.8 Out-of-scope guard: authenticated user hitting `/verify-email`

A logged-in user visiting `/verify-email` is a **Phase 6** route-guard concern (`PublicRoute`). Phase 4's
page is reachable regardless of auth state and doesn't touch the session store — leave guarding to Phase 6.

---

## 3. Files to create / modify

```
src/
  features/
    auth/
      validation.ts        # MODIFY — add resendFormSchema (single email field) + ResendFormValues
      queries.ts           # MODIFY — add useVerifyEmail (useMutation over api.verifyEmail)
      components/
        AuthBadge.tsx      # NEW — shared 60×60 accent circle badge (glyph via children)
      pages/
        VerifyEmailPage.tsx # NEW — /verify-email (2c confirm, 3f success, 3g invalid/expired + resend)
        CheckInboxPage.tsx  # MODIFY — swap inline @ badge for <AuthBadge> (extraction payoff)
      index.ts             # MODIFY — export VerifyEmailPage, useVerifyEmail, resendFormSchema/type
  App.tsx                  # MODIFY — add /verify-email; remove /dev/centered-preview + CenteredPreview
```

Notes on placement:
- `VerifyEmailPage` sits alongside `RegisterPage`/`CheckInboxPage` under `features/auth/pages/`.
- `AuthBadge` lives under `features/auth/components/` next to `RegisterMarketing` — it's auth-page content,
  not a generic app primitive (leave `src/components/` for cross-feature primitives).
- `resendFormSchema` joins `registerFormSchema` in `validation.ts` (user-input schemas), separate from
  `schemas.ts` (API-response schemas) — same split Phase 3 established.
- `useVerifyEmail` joins the other mutation hooks in `queries.ts` (the single React-Query-facing file); the
  core `api.ts`/`session.ts` stay React-free.

---

## 4. Implementation detail

### 4.1 `src/features/auth/validation.ts` (addition)

```ts
// alongside registerFormSchema
export const resendFormSchema = z.object({
  email: z.email('Enter a valid email'),   // zod v4 top-level format, matching register's field
});
export type ResendFormValues = z.infer<typeof resendFormSchema>;
```

Minimal — the only field is the email the user must type on the 3g screen. Same `z.email()` guard as
register's email field, so blank/invalid input yields an inline message before we fire the (always-202)
resend.

### 4.2 `src/features/auth/queries.ts` (addition)

```ts
import type { RegisterRequest, ResendRequest, VerifyEmailRequest } from './schemas';

/**
 * Verify-email mutation (POST /verify-email → ALWAYS 200 { status }). The three
 * outcomes (success | expired | invalid) are NOT HTTP errors — the page branches on
 * `data.status`, not on isError. A rejected promise here means a genuine transport/5xx
 * fault (see the page's error branch), not a bad token. No cache writes: verify issues
 * no tokens and doesn't feed /me.
 */
export function useVerifyEmail() {
  return useMutation({
    mutationFn: (body: VerifyEmailRequest) => api.verifyEmail(body),
  });
}
```

- No `onSuccess` cache writes (consistent with `useRegister`/`useResendVerification`).
- Page reads `verifyMut.mutate(...)`, `verifyMut.isPending` (Confirm button loading/disabled),
  `verifyMut.isSuccess` + `verifyMut.data.status` (the 3f/3g branch), and `verifyMut.isError` (transport
  failure → 2c error banner).

### 4.3 `src/features/auth/components/AuthBadge.tsx` (new)

As in §2.2 — a `forwardRef`-free presentational `<div>` wrapping the accent circle; glyph and glyph-size
passed by the caller. Extracted from the exact markup Phase 3's check-inbox already ships, so it's
visually a no-op for that screen.

### 4.4 `src/features/auth/pages/VerifyEmailPage.tsx` (new)

Skeleton (derive-from-mutation approach, §2.1):

```tsx
export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = (searchParams.get('token') ?? '').trim();
  const verifyMut = useVerifyEmail();

  const status = verifyMut.data?.status;
  const showSuccess = verifyMut.isSuccess && status === 'success';
  const showInvalid = !token || (verifyMut.isSuccess && status !== 'success');

  return (
    <CenteredAuthLayout>
      {showSuccess ? (
        <VerifySuccess />                 // 3f
      ) : showInvalid ? (
        <VerifyInvalid />                 // 3g (+ resend form)
      ) : (
        <VerifyConfirm                    // 2c
          onConfirm={() => verifyMut.mutate({ token })}
          pending={verifyMut.isPending}
          errored={verifyMut.isError}
        />
      )}
    </CenteredAuthLayout>
  );
}
```

- **`VerifyConfirm` (2c)**: centered column, header block, primary `Button` "Confirm email"
  (`disabled={pending}`, label → "Confirming…" while pending), caption "this link is single-use". When
  `errored`, render a `Banner variant="error"` above the button ("Something went wrong. Please try again.")
  and keep the button enabled for a retry (§2.4). `onClick={onConfirm}`.
- **`VerifySuccess` (3f)**: centered column, `<AuthBadge className="text-[25px]">✓</AuthBadge>`, header
  block ("Email confirmed" / "Your account is verified. / Sign in to start screening."), primary CTA
  `<Link to="/login">` styled as the accent button ("Go to sign in").
- **`VerifyInvalid` (3g)**: left-aligned column, header block ("This link is invalid or has expired" /
  explanatory copy), an RHF form (`resendFormSchema`) with a single `TextField` email, primary `Button`
  "Send new link" (`disabled={cooldown.active || resendMut.isPending}`, label → "Sending…"), and the
  cooldown/confirmation caption (§2.5). Uses `useResendVerification()` + `useCooldown(60)`; on valid submit,
  `cooldown.start()` then `resendMut.mutate({ email })`.
  - These three can be small components in the same file (co-located, not exported) or inline blocks —
    recommend three local function components for readability, matching how the states differ structurally.

### 4.5 `src/features/auth/pages/CheckInboxPage.tsx` (modify)

Replace the inline badge `<div>` (lines ~40–48) with `<AuthBadge className="text-[23px]">@</AuthBadge>` and
import `AuthBadge`. No other change — the rendered result is identical.

### 4.6 `src/features/auth/index.ts` (modify)

- Add `export { VerifyEmailPage } from './pages/VerifyEmailPage';`
- Add `useVerifyEmail` to the `queries` re-export line.
- Add `resendFormSchema, type ResendFormValues` to the `validation` re-export line.
- (`AuthBadge` is internal to the auth feature — no need to re-export from the barrel unless a consumer
  outside `features/auth` needs it, which none does.)

### 4.7 `src/App.tsx` (routing)

- Add `<Route path="/verify-email" element={<VerifyEmailPage />} />` and import `VerifyEmailPage` from
  `@/features/auth`.
- **Remove** the `/dev/centered-preview` route **and** the `CenteredPreview` component function — Phase 3
  kept it as the last dev-preview scaffold specifically for Phase 4 to replace (per Phase 1's "deleted once
  Phase 3–5 replace them"; Phase 3 already removed `/dev/split-preview`). The real `/verify-email` now
  exercises `CenteredAuthLayout`. Keep the `Placeholder` root and the `*` catch-all redirect.

---

## 5. Verification

- `npm run typecheck` and `npm run build` pass.
- `npm run dev`, then exercise against a running backend (`VITE_DEV_PROXY_TARGET` at it, or the Vite proxy
  default `localhost:8080`):
  - **No token** — visit `/verify-email` (no query) → renders **3g** immediately ("This link is invalid or
    has expired") with the email-entry resend form, and **no** `verify-email` network call fires (check the
    Network tab). Submitting an email → `202`, cooldown starts, caption confirms generically.
  - **Valid token** — register a fresh account, take the token from the emailed link (or backend logs),
    visit `/verify-email?token=<valid>` → **2c** "Confirm your email" renders; confirm **nothing is POSTed
    on load** (email-scanner check — Network tab empty until click). Click **Confirm email** → button shows
    "Confirming…" then **3f** "Email confirmed" with the ✓ badge; "Go to sign in" points at `/login`.
  - **Expired/invalid/reused token** — visit with an already-consumed or >24h token, click Confirm → the
    POST returns `200 {status:"invalid"|"expired"}` → **3g**. The resend form sends a fresh link (202,
    generic).
  - **Double-click Confirm** — the button is disabled after the first click (`isPending`), so only **one**
    POST fires; the flow lands on 3f/3g without a self-inflicted second `invalid`.
  - **Transport failure** — (optional) point the proxy at a down backend or throttle to force a 5xx/timeout,
    click Confirm → stays on **2c** with the "Something went wrong. Please try again." banner and an enabled
    button (token not consumed), not a misleading 3g.
  - **Badge parity** — visually confirm the 3f ✓ badge and the (refactored) check-inbox @ badge render
    identically to before (same circle, border, bg) — the `AuthBadge` extraction is a no-op for 3e.
- Manual a11y sanity: tab order (Confirm button / resend form) is logical; the 2c error banner and inline
  email error are reachable/legible. Full `aria-live` announcement of banners is a Phase 7 item.

## 6. Out of scope (later phases — do not pull in)

- Login page + its error states (2a/3a/3b/3c) — Phase 5. The 3f "Go to sign in" link renders but `/login`
  isn't built here.
- The **403-on-login** resend affordance (Phase 5) reuses the same `useResendVerification` + `useCooldown`
  primitives this phase exercises, but its screen is Phase 5's work.
- Session bootstrap, `PublicRoute`/`ProtectedRoute` guards (e.g. redirecting an already-authenticated user
  away from `/verify-email`) — Phase 6. Phase 4's page is reachable in any auth state and never touches the
  session store (verify issues no tokens).
- Any spinner/loading-prop addition to the `Button` primitive — optional Phase 7 polish; this phase uses the
  disabled + text-swap pattern `RegisterPage` already established.
- Distinguishing `expired` from `invalid` in the UI — the design deliberately collapses both into 3g; no
  separate screen.

## 7. Commit

Single commit, e.g. `Add verify-email flow (Phase 4)` — the new `/verify-email` page (2c confirm / 3f
success / 3g invalid+resend), the extracted `AuthBadge` (with check-inbox refactored onto it), the
`useVerifyEmail` mutation, the one-field `resendFormSchema`, routing updated, and the final
`/dev/centered-preview` scaffold removed.

---

## 8. Concerns / open questions to flag

1. **Refactoring a Phase 3 file (`CheckInboxPage`).** §2.2 recommends swapping its inline badge for the new
   `AuthBadge`. This is the cleanest way to avoid a third badge copy and is exactly the extraction Phase 3
   deferred to "when Phase 4 wants it" — but it does mean Phase 4 edits a Phase-3-committed file. Called out
   so the reviewer can approve (recommended) or opt for the leave-it-duplicated fallback.
2. **Transport-failure branch (§2.4).** The parent plan's one-liner "branch on response status" doesn't
   address what happens when the POST itself fails (network/5xx) rather than returning a status. I've
   specified: stay on 2c, show a retry banner, keep the token unconsumed. Confirm this is the desired UX (vs.
   e.g. routing to 3g, which I argue is misleading).
3. **3g resend caption wording.** The mockup's static caption is "if an unverified account exists, a link
   will be sent". I propose layering cooldown/"Sent" states on top of it (§2.5), consistent with check-inbox.
   If you'd rather keep the caption strictly static (always the mockup text) and rely only on the button's
   disabled state for feedback, that's a one-line change — flag your preference.
4. **Resend form validation depth.** I recommend RHF + a one-field `z.email()` schema for a format guard +
   inline error, matching register. A lighter-weight controlled input with no validation would also work
   (the endpoint is always-202 anyway), but the format guard prevents an obviously-junk submit and keeps the
   form stack consistent across the feature. Flagging in case you'd prefer the minimal version.
5. **Success screen has no auto-redirect.** Per the API doc, 3f does **not** auto-login and I do **not**
   auto-navigate to `/login` — the user clicks "Go to sign in". Confirming that's intended (no timed
   redirect), matching the design.
```