# Phase 5 — Login flow + error states (2a, 3a, 3b, 3c)

Parent plan: [`auth-templates-implementation.md`](./auth-templates-implementation.md) § Phase 5.
API contract: [`.claude/docs/auth-api.md`](../docs/auth-api.md) §3.4 (login), §3.3 (resend), §1 (the
enumeration note that makes the 403 branch safe).
Design source: Claude Design project **Screener Authentication Templates**
(`Auth Pages.dc.html`, project id `1311c691-ada2-4d29-ab30-7ab9f335123a`), desktop templates
**2a** (sign in), **3a** (invalid credentials 401), **3b** (email not verified 403 → resend),
**3c** (account disabled 401).

**Goal**: ship the third and last independently-testable auth flow — a `/login` page that submits to
`POST /api/auth/login`, stores the returned token pair via the Phase 2 session layer, and routes into
the app. The single form renders one of three server-error treatments derived from the response
status/message: a red "invalid credentials" banner (3a, both fields tinted), a red "account disabled"
banner with an inert support link (3c), and an amber "verify your email" banner carrying an inline
**Resend verification email** button (3b) wired to the Phase 3 `useResendVerification` +
`useCooldown`. It reuses the Phase 1 `SplitAuthLayout` (its **default** left panel *is* the 2a
content) + primitives, the Phase 2 `loginAndStore`/`api.login`, and the Phase 3 resend/cooldown
machinery. This is the flow that finally makes every `/login` link the earlier phases planted
(register footer, check-inbox, verify 3f) live.

---

## 1. Template analysis (values pulled from `Auth Pages.dc.html`, not estimated)

All four screens share the **`SplitAuthLayout`** shell (marketing panel `flex:1.2` + right form
panel `flex:1` centering a **400px** column) and an identical **400px form column** (`gap:24px`).
Crucially, the left/marketing panel on 2a/3a/3b/3c is the **order-book-card panel** — the exact
content Phase 1 hardcoded as `SplitAuthLayout`'s `DefaultMarketing` (headline "Every level that
matters, in real time." + subtext + the BTCUSDT order-book preview card). So **login renders
`<SplitAuthLayout>` with no `marketing` prop** and gets the correct 2a panel for free — the opposite
of register, which had to pass its own stats panel. `showTicker` stays `false` (the `sc-if` ticker is
decorative, per Phases 3–4).

The **form column is identical across all four** except for the error banner (and, on 3a, the field
border tint). Structure, top to bottom:

### 2a — Sign in (the base, no error)

- Header block (`flex flex-col gap-2`, i.e. `gap:8px`): `h1` "Sign in" (`text-[26px] font-semibold
  tracking-[-0.01em] text-text`); `p` "Welcome back. Your books are still running." (`text-[14px]
  leading-[1.55] text-text-secondary`).
- Fields block (`flex flex-col gap-[18px]`):
  - **Email** (`type="email"`, `placeholder="ada@example.com"`, label "Email").
  - **Password** (`type="password"`, `placeholder="••••••••••••"`, label "Password").
- **Primary button**, full-width: "Sign in".
- Footer `p`, centered (`text-[14px] text-text-secondary`): "New to Screener? **Create an account**"
  — the link points at `/register` (accent-colored, `no-underline`). *(Mockup `href="#2b"` = register;
  this is the mirror of register's "Already have an account? Sign in".)*

### 3a — Invalid credentials (401 `Invalid credentials`)

- Identical to 2a **plus** a red error `Banner` between the header block and the fields block:
  copy **"Invalid email or password."** (the design's friendlier wording — see §2.4 on why we show
  this instead of the raw backend `"Invalid credentials"`).
- **Both** the email and password field borders tinted danger (`color-mix(#F26D6D 45%)`) — i.e. pass
  `invalid` to both `TextField`s. No per-field message (the banner carries the copy). This is the
  same `invalid` prop Phase 3 added for register's 409.
- Banner colors already match Phase 1's `Banner variant="error"` (`#F26D6D` @ 10% bg / 38% border,
  text `#F0A2A2`) — no new styling.

### 3b — Email not verified (403 `Email not verified` → resend)

- Identical to 2a **plus** an **amber** composite banner between the header and the fields — this is
  the key non-trivial state. The banner is a `flex flex-col gap-3` (`gap:12px`) box, `padding:16px`,
  `color-mix(#F5B84D 8%, transparent)` bg / `color-mix(#F5B84D 35%, transparent)` border — which is
  **exactly** Phase 1's `Banner variant="warning"` config (`var(--color-warning)` @ 8% bg / 35%
  border, text `#F2D49B`). So render `<Banner variant="warning">` and compose the two children inside:
  - `p` (inherits banner text `#F2D49B`, `text-[14px] leading-[1.5]`): "Please verify your email
    before logging in. We sent a link to **`<email>`**." — the email interpolated and bolded
    (`font-medium`, `#F8E3BE` ≈ a slightly brighter amber; render as `text-[#F8E3BE]`).
  - **Amber outline button** (`align-self:flex-start`): "Resend verification email". Bespoke sizing
    (`padding:9px 16px`, `text-[14px] font-medium`, `rounded-[7px]`, transparent bg, border
    `color-mix(#F5B84D 55%, transparent)`, text `#F5B84D`, hover `bg color-mix(#F5B84D 12%)`). See
    §2.5 — this is an inline bespoke button, **not** the accent-green `Button` outline variant.
- **Fields are NOT tinted** — the password was correct (the 403 only fires *after* the password
  checks out, per API doc §3.4); tinting them would wrongly imply a credential error.

### 3c — Account disabled (401 `Account disabled`)

- Identical to 2a **plus** a red error `Banner` (same `variant="error"` as 3a): "Your account has
  been disabled. Contact **support**." — where "support" is an inert `<a>` (`text-[#F5C0C0]
  font-medium`, `href="#"` / no-op) per the locked decision in the parent plan (no destination yet).
- **Fields NOT tinted** (the failure isn't about the credentials themselves — same reasoning as 3b).

**Deliberate deviations from the raw mockup** (consistent with Phases 1–4):
- The mockup's `style-hover`/`style-focus` pseudo-attributes aren't real CSS — real
  `:hover`/`transition`/`:focus-visible` already live in the Phase 1 `Button`/`TextField` primitives
  and are inherited. The one exception is the bespoke amber button (§2.5), which carries its own
  hover.
- The mockup hardcodes example values (`ada@example.com`, `wrongpassword`) into the inputs to
  visualize the states; the real fields are RHF-controlled and start empty (email uses a placeholder).

---

## 2. Decisions & concerns (addressed, with recommended defaults)

### 2.1 The left panel is the layout default — do NOT extract a `LoginMarketing`

Phase 3 flagged: *"Extracting a symmetric `LoginMarketing` component is a Phase 5 nicety, not a Phase
3 task."* The verdict now: **don't extract it either.** `SplitAuthLayout`'s built-in
`DefaultMarketing` **is** the 2a panel, verbatim. Login renders `<SplitAuthLayout>{form}</SplitAuthLayout>`
with no `marketing` prop and is pixel-correct with zero new component. Extracting a `LoginMarketing`
would only move the layout's default out into the auth feature for symmetry's sake, adding a file and
an indirection for no behavioral gain. Leave the default where it is. *(If a future non-auth surface
ever needs that default gone, extraction is a trivial follow-up — but nothing needs it now.)*

### 2.2 One page, three error treatments derived from a single `submitError` — mirror `RegisterPage`

`/login` is a **single page component** holding one piece of error state: `submitError: ApiError |
null`, set in the `mutateAsync` catch exactly like `RegisterPage` (§4.4 of Phase 3). Everything the UI
shows is **derived** from `submitError` — no separate state machine, no `useEffect`:

```
const disabled  = submitError?.status === 401 && submitError.message === 'Account disabled';   // 3c
const unverified = submitError?.status === 403;                                                // 3b
const invalidCreds = submitError?.status === 401 && !disabled;                                 // 3a (default 401)
```

The three banners are mutually exclusive (each status/message maps to exactly one). On a successful
resubmit the catch never runs, but clear `submitError` at the **top of `onValid`** (as register does)
so a prior banner doesn't linger while the new request is in flight.

### 2.3 Distinguishing the two 401s — branch on `message`, not just status

Both "invalid credentials" (3a) and "account disabled" (3c) return **401** — they differ only by the
`message` field (`"Invalid credentials"` vs `"Account disabled"`, per API doc §3.4). So the page must
branch on `submitError.message === 'Account disabled'` to pick 3c; every other 401 falls through to
3a. The `403` is unambiguous (only "email not verified" uses it in the login flow). Anything
unexpected (e.g. a stray `400`/`500`) → fall back to a plain red `Banner` showing `submitError.message`
(backend copy is user-safe, per API doc §1), rather than mislabeling it as one of the three known
states.

**Coupling note (flag):** matching the literal string `'Account disabled'` couples the client to the
backend's exact message text. It's the only signal available (both cases are 401, and there's no
error code field — API doc §1: "no `error` field"), so this is unavoidable, but it's worth a comment
in the code so a future backend copy change is a known breakage point. The generic-401 fallback (3a)
means a *changed* disabled message degrades gracefully to "invalid email or password" rather than
crashing — acceptable.

### 2.4 Copy: show the design's "Invalid email or password.", not the raw backend message

The backend returns `message: "Invalid credentials"` for 3a; the mockup shows **"Invalid email or
password."** Recommendation: render the **design copy** for the two *known, designed* states (3a
"Invalid email or password." and 3c "Your account has been disabled. Contact support.") — they're
part of the visual contract and read better — and fall back to the **raw `submitError.message`** only
for the unexpected-status case (§2.3). This keeps the designed screens on-copy while never swallowing
an unforeseen server message. (The API doc explicitly blesses showing `message` directly, so the
fallback is safe; we're choosing nicer fixed copy for the cases the designer actually wrote.)

### 2.5 The amber resend button (3b) is inline & bespoke — not the `Button` outline variant

The 3b resend button is amber (`#F5B84D`), with its own sizing (`9px 16px` padding, `14px`, `500`,
`rounded-[7px]`, `align-self:flex-start`) — materially different from the accent-green `Button`
`outline` variant (`14px 14px` padding, `15px`, `rounded-[8px]`, full-width, accent-colored). Forcing
`Button` into this shape means overriding padding, size, radius, width, **and** all three colors —
more churn than an inline element and less faithful. Per the Phases 3–4 ethos ("match the mockup,
don't prematurely generalize"; this amber button appears **nowhere else** in the design), build it as
an **inline `<button>`** inside the warning `Banner`, styled to match 3b exactly, with its own
`disabled` handling for the cooldown. **Leave a `TODO` comment on it** flagging future extraction, so
that if the `Button` primitive ever grows variants, this call site is easy to find and fold in:

```tsx
{/* TODO: this button might be extracted into a reusable inline Button variant (e.g. warning/amber)
    if a second amber button ever appears — until then, inline to match 3b exactly. */}
<button
  type="button"
  onClick={onResend}
  disabled={cooldown.active || resendMut.isPending}
  className="self-start rounded-[7px] border px-4 py-[9px] text-[14px] font-medium transition-colors
             disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline
             focus-visible:outline-2 focus-visible:outline-offset-2"
  style={{
    color: 'var(--color-warning)',
    borderColor: 'color-mix(in oklab, var(--color-warning) 55%, transparent)',
  }}
>
  {resendMut.isPending ? 'Sending…' : cooldown.active ? `Resend in ${cooldown.remaining}s` : 'Resend verification email'}
</button>
```

**Decision (locked):** inline, **not** a new `Button` variant — a `warning`/amber variant is
speculative (a single call site) and the parent plan lists Button-variant work as out of scope. The
`TODO` above is the deliberate breadcrumb for a later cleanup pass if variants do materialize.

### 2.6 The 3b resend — reuse `useResendVerification` + `useCooldown(60)`, email from the form

This is the **third** consumer of the Phase 3 resend/cooldown pair (check-inbox, verify-3g, now
login-403) — exactly why they were built reusable. Unlike verify-3g (which has no email and must ask),
login-403 **already has the email the user typed** (API doc §3.4: *"using the email the user just
typed into the login form — you already have it, no need to ask again"*). So:

- Read the current email from RHF: `getValues('email')` (or `watch('email')`) at click time — the 403
  only appears after a submit, so a valid email is present in the field.
- On click: `cooldown.start()` (cosmetic, on click, per §2.3 of Phase 3) then `resendMut.mutate({
  email })`. Always 202; outcome deliberately opaque — no enumeration.
- Feedback lives **in the button label** (`Sending…` / `Resend in {n}s`) and its `disabled` state —
  the 3b mockup gives the banner no separate caption line, so we don't add one; the button's own
  states carry it. (Optionally, after `resendMut.isSuccess`, the banner `p` could append a generic
  "Sent — check your inbox." but the minimal, on-mockup version keeps the static copy and relies on
  the button — recommend the minimal version; flag in §8.)

### 2.7 Success path — store tokens, then route to `/`; `/me` hydration stays light

On a `200`, `api.login` returns the token pair and Phase 2's **`loginAndStore`** already persists it
and arms the proactive-refresh timer (it deliberately does **not** fetch `/me` — that was left to
"a page/bootstrap decision"). Recommendation:

- Wrap `loginAndStore` in a `useLogin` mutation (§4.2) so the page gets `isPending` for the button and
  a rejecting `mutateAsync` for the error branch — consistent with `useRegister`/`useVerifyEmail`.
- On success, **`navigate('/', { replace: true })`** — the app root is still the Phase 1
  `Placeholder`; there's no gated app yet, and building one is out of scope. `replace` so Back doesn't
  return to the login form now that the user is authenticated.
- **`/me`**: don't block navigation on it. `useMe` (Phase 2) auto-fires the moment
  `loginAndStore` flips `status` to `'authenticated'`, so the profile hydrates on its own. Optionally
  fire a non-blocking `queryClient.prefetchQuery({ queryKey: authKeys.me, queryFn: fetchMe })` right
  after `loginAndStore` to warm it a beat earlier — a nicety, not required. Full bootstrap/guard wiring
  (redirect-away-when-authenticated, gating on `accessState`) is **Phase 6**. Recommend the minimal
  version: `loginAndStore` → `navigate('/')`, skip the explicit prefetch.

### 2.8 Login validation (RHF + Zod) — required-only, no length floor

Add a `loginFormSchema` to `validation.ts`:

```ts
export const loginFormSchema = z.object({
  email: z.email('Enter a valid email'),                 // same format guard as register's email
  password: z.string().min(1, 'Password is required'),   // required, but NO min-8 here
});
export type LoginFormValues = z.infer<typeof loginFormSchema>;
```

**Do not** reuse register's `min(8)` password rule: login must accept whatever password the account
already has (register's 8-char floor is a client-side *creation* guard, and the backend enforces no
length at all — API doc + Phase 3 §2.7). A `min(1)` "required" guard is all that's warranted;
everything else is the server's call (401). Email/password client errors surface as ordinary **inline**
`TextField` messages (via `error={errors.x?.message}`) — the server-error *banners* (3a/3b/3c) are a
separate, submit-time concern layered above the fields.

### 2.9 Routing & links going live

- Add `<Route path="/login" element={<LoginPage />} />` to `App.tsx`. This makes every `/login` link
  the prior phases planted **live** (register footer "Sign in", check-inbox "Back to sign in", verify
  3f "Go to sign in") — until now the catch-all bounced them to `/`.
- Login's own footer link → `/register` (a router `<Link>`, SPA nav), and the register route already
  exists, so that link is live immediately too.
- Keep the `Placeholder` root and the `*` catch-all. `PublicRoute` (redirect an already-authenticated
  user away from `/login`) is **Phase 6** — Phase 5's page is reachable in any auth state.

---

## 3. Files to create / modify

```
src/
  features/
    auth/
      validation.ts        # MODIFY — add loginFormSchema (email + required password) + LoginFormValues
      queries.ts           # MODIFY — add useLogin (useMutation over loginAndStore)
      pages/
        LoginPage.tsx      # NEW — /login (2a base + 3a/3b/3c server-error treatments)
      index.ts             # MODIFY — export LoginPage, useLogin, loginFormSchema/LoginFormValues
  App.tsx                  # MODIFY — add /login route
```

Notes on placement:
- `LoginPage` sits alongside `RegisterPage`/`CheckInboxPage`/`VerifyEmailPage` under
  `features/auth/pages/`.
- `loginFormSchema` joins `registerFormSchema`/`resendFormSchema` in `validation.ts` (user-input
  schemas), separate from `schemas.ts` (API-response schemas) — the split Phases 3–4 established.
- `useLogin` joins the other mutation hooks in `queries.ts` (the single React-Query-facing file); the
  core `api.ts`/`session.ts` stay React-free. `useLogin` wraps `loginAndStore` (from `session.ts`),
  which is the layer that actually persists tokens and schedules refresh.
- **No new primitives, no layout change, no `Button` change** — the amber resend button is inline in
  the page (§2.5). This is the lightest of the three user-facing phases: two edits + one new page.

---

## 4. Implementation detail

### 4.1 `src/features/auth/validation.ts` (addition)

Add `loginFormSchema` + `LoginFormValues` as in §2.8. Same `z.email()` v4 top-level format guard as
the other two schemas; password is `min(1)` required only.

### 4.2 `src/features/auth/queries.ts` (addition)

```ts
import { loginAndStore } from './session';
import type { LoginRequest /* … */ } from './schemas';

/**
 * Login mutation (POST /login → 200 token pair). Wraps `loginAndStore`, which persists
 * the tokens + arms proactive refresh; this hook exists so the page gets `isPending`
 * (button) and a rejecting `mutateAsync` (the 3a/3b/3c error branch). No cache writes
 * here — /me hydrates on its own once the session flips to authenticated (see useMe).
 * A rejected promise is an `ApiError`: 401 invalid/disabled, 403 unverified.
 */
export function useLogin() {
  return useMutation({
    mutationFn: (body: LoginRequest) => loginAndStore(body),
  });
}
```

- No `onSuccess` cache writes (consistent with the other mutation hooks). Navigation is the page's
  job (a mutation hook shouldn't import the router).

### 4.3 `src/features/auth/pages/LoginPage.tsx` (new)

Skeleton (derive-from-`submitError`, §2.2), mirroring `RegisterPage`'s structure:

```tsx
export function LoginPage() {
  const navigate = useNavigate();
  const loginMut = useLogin();
  const resendMut = useResendVerification();
  const cooldown = useCooldown(60);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);

  const { register, handleSubmit, getValues, formState: { errors } } =
    useForm<LoginFormValues>({ resolver: zodResolver(loginFormSchema) });

  const disabled     = submitError?.status === 401 && submitError.message === 'Account disabled';
  const unverified   = submitError?.status === 403;
  const invalidCreds = submitError?.status === 401 && !disabled;
  const otherError   = submitError && !disabled && !unverified && !invalidCreds; // stray 400/5xx

  async function onValid(values: LoginFormValues) {
    setSubmitError(null);
    try {
      await loginMut.mutateAsync(values);        // loginAndStore persists tokens
      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) setSubmitError(err);
    }
  }

  function onResend() {
    cooldown.start();
    resendMut.mutate({ email: getValues('email') });   // 403 path always has a typed email
  }

  return (
    <SplitAuthLayout>{/* no `marketing` prop → default = the 2a panel */}
      <form onSubmit={handleSubmit(onValid)} noValidate className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-[26px] font-semibold tracking-[-0.01em] text-text">Sign in</h1>
          <p className="text-[14px] leading-[1.55] text-text-secondary">
            Welcome back. Your books are still running.
          </p>
        </div>

        {invalidCreds && <Banner variant="error">Invalid email or password.</Banner>}
        {disabled && (
          <Banner variant="error">
            Your account has been disabled. Contact{' '}
            <a href="#" className="font-medium text-[#F5C0C0]">support</a>.
          </Banner>
        )}
        {unverified && (
          <Banner variant="warning" className="flex flex-col gap-3">
            <p className="m-0 text-[14px] leading-[1.5]">
              Please verify your email before logging in. We sent a link to{' '}
              <strong className="font-medium text-[#F8E3BE]">{getValues('email')}</strong>.
            </p>
            {/* inline amber resend button — §2.5; carries the "might be extracted into a
                reusable inline variant" TODO for a future Button-variant cleanup */}
          </Banner>
        )}
        {otherError && <Banner variant="error">{submitError!.message}</Banner>}

        <div className="flex flex-col gap-[18px]">
          <TextField label="Email" type="email" placeholder="ada@example.com"
            error={errors.email?.message} invalid={invalidCreds} {...register('email')} />
          <TextField label="Password" type="password" placeholder="••••••••••••"
            error={errors.password?.message} invalid={invalidCreds} {...register('password')} />
        </div>

        <Button type="submit" variant="primary" disabled={loginMut.isPending}>
          {loginMut.isPending ? 'Signing in…' : 'Sign in'}
        </Button>

        <p className="text-center text-[14px] text-text-secondary">
          New to Screener?{' '}
          <Link to="/register" className="font-medium text-accent no-underline">Create an account</Link>
        </p>
      </form>
    </SplitAuthLayout>
  );
}
```

Detail notes:
- **Field tint (`invalid`)**: pass `invalid={invalidCreds}` to **both** email & password (3a tints
  both); 3b/3c leave them untinted (the flags are false there). The inline `error` messages
  (client-side required/format) render independently and are cleared once the field is valid — they
  won't collide with the banner because client validation blocks submit before any server error
  exists.
- **Amber button**: the inline `<button>` from §2.5 goes where the comment sits, using
  `getValues('email')` via `onResend`. Its label swaps `Resend verification email` → `Sending…` /
  `Resend in {n}s`.
- **`getValues` vs `watch`**: `getValues('email')` is fine for both the banner text and the resend —
  the 403 banner only renders after a submit, at which point the email is committed and RHF isn't
  re-rendering it. (Use `watch('email')` only if you want the banner's echoed address to live-update
  as the user edits the field afterward — unnecessary; recommend `getValues`.)

### 4.4 `src/features/auth/index.ts` (modify)

- Add `export { LoginPage } from './pages/LoginPage';`
- Add `useLogin` to the `queries` re-export line.
- Add `loginFormSchema, type LoginFormValues` to the `validation` re-export line.

### 4.5 `src/App.tsx` (routing)

- Import `LoginPage` from `@/features/auth` and add
  `<Route path="/login" element={<LoginPage />} />`.
- Leave the `Placeholder` root and the `*` catch-all untouched (Phase 6 owns guards + a real authed
  landing). No dev-preview routes remain to remove (Phase 4 removed the last one).

---

## 5. Verification

- `npm run typecheck` and `npm run build` pass.
- `npm run dev`, then exercise against a running backend (`VITE_DEV_PROXY_TARGET` at it, or the Vite
  proxy default `localhost:8080`):
  - **2a base** — visit `/login`. Confirm the **left panel is the order-book-card / "Every level that
    matters" panel** (the layout default), the form matches 2a (header, email/password, "Sign in",
    "New to Screener? Create an account" → `/register`). Client validation: submit empty → inline
    "required"/format errors on the fields; no network call.
  - **3a invalid credentials** — sign in with a real email + wrong password (or an unknown email) →
    `401` → red banner **"Invalid email or password."**, **both** field borders tinted danger, button
    re-enabled for retry.
  - **3b email not verified** — register a fresh account (don't verify), then sign in with its
    correct password → `403` → **amber** banner "Please verify your email before logging in. We sent a
    link to `<email>`." with the inline amber **Resend verification email** button; fields **not**
    tinted. Click Resend → button disables ~60s (cooldown starts on click), label counts down, a
    `202` fires (Network tab); generic outcome (no enumeration).
  - **3c account disabled** — sign in to an admin-disabled account with the correct password → `401
    Account disabled` → red banner "Your account has been disabled. Contact support." (support link
    inert, `href="#"`); fields **not** tinted. Confirm this is **distinct** from the 3a copy/treatment
    (the message-branch in §2.3 works).
  - **Success** — sign in with valid, verified credentials → tokens land in `localStorage`
    (`accessToken`/`refreshToken`/`expiresAt`), the session store flips to `authenticated`, and the
    app routes to `/` (the Placeholder). Reload → tokens rehydrate (Phase 2 behavior); full
    `/me`-gated bootstrap is Phase 6.
  - **Links live** — from `/register` click "Sign in", from check-inbox click "Back to sign in", from
    a successful verify (3f) click "Go to sign in" → all now land on the real `/login` (no more
    catch-all bounce to `/`).
- Manual a11y sanity: tab order (email → password → Sign in → footer link) is logical; the
  submit-error `Banner` and the inline amber button are reachable/legible. Full `aria-live`
  announcement of the banners is a Phase 7 item.

## 6. Out of scope (later phases — do not pull in)

- **Session bootstrap on reload, route guards, logout** — Phase 6. That includes `PublicRoute`
  (redirecting an already-authenticated user away from `/login`), `ProtectedRoute`, the on-load
  `/me`-or-`/refresh` hydration, and the `/logout` action. Phase 5 stores tokens and navigates to `/`;
  it does **not** guard routes or gate on `accessState`.
- **A real authenticated landing page / app shell** — the success path lands on the Phase 1
  `Placeholder` root. Building the actual app (order book, rules, billing) is later feature work.
- **Blocking navigation on `/me`** — the profile hydrates lazily via `useMe`; gating the app on
  `accessState` is Phase 6.
- **Any `Button` primitive change** (an amber/warning variant, a loading/spinner prop) — the amber
  resend button is inline (§2.5) and the "Signing in…" affordance is the disabled + text-swap pattern
  Phases 3–4 established. Optional Phase 7 polish.
- **Forgot/reset-password** — not in the design or the backend API; confirmed out of scope by the
  parent plan.

## 7. Commit

Single commit, e.g. `Add login flow (Phase 5)` — the new `/login` page (2a sign-in with the 3a
invalid-credentials / 3b email-not-verified-resend / 3c account-disabled server-error treatments), the
`useLogin` mutation over `loginAndStore`, the `loginFormSchema` (required email + password, no length
floor), and the `/login` route (which makes every earlier `/login` link live). No primitive or layout
changes — login reuses the `SplitAuthLayout` default panel and the Phase 3 resend/cooldown machinery.

---

## 8. Resolved decisions (formerly open questions — all confirmed by the product owner)

All five points below are **locked**; there are no open questions blocking implementation.

1. **Coupling to the literal `'Account disabled'` message (§2.3) — LOCKED: cap to the string match
   for now.** Distinguishing 3c from 3a is done by matching the backend's exact message text — the
   only available signal (both are 401, no error-code field per API doc §1). This is accepted as a
   known limitation; a discriminating field / error code from the backend is a **future enhancement**,
   not Phase 5 work. The generic-401 fallback (→ 3a treatment) means a changed backend copy degrades
   gracefully rather than crashing.
2. **Copy for 3a (§2.4) — LOCKED: show the design's "Invalid email or password."** Render the designed
   copy for the two known states (3a and 3c) and fall back to the raw `submitError.message` only for
   an unexpected status. (Confirmed as recommended.)
3. **Amber resend button (§2.5) — LOCKED: inline, no new `Button` variant.** Build it as an inline
   `<button>` matching 3b, and **leave a `TODO` comment** reading roughly *"this button might be
   extracted into a reusable inline variant"* so a future Button-variant cleanup can find and fold in
   this call site easily. Do **not** add a `warning`/amber variant to the primitive now.
4. **3b resend feedback (§2.6) — LOCKED: keep feedback in the button label + disabled state.** The
   amber banner copy stays static; the resend button carries all feedback via its label
   (`Sending…` / `Resend in {n}s`) and `disabled` state. No extra "Sent — check your inbox." caption.
5. **Success navigation (§2.7) — LOCKED: navigate to `/`.** On success, `navigate('/', { replace:
   true })` and let `/me` hydrate lazily via `useMe`. All guard/bootstrap/`accessState` logic is
   deferred to Phase 6. No timed redirect, no blocking on `/me`.
