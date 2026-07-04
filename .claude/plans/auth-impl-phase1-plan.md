# Phase 1 — Design Tokens & Shared UI Primitives

## Context

This is Phase 1 of the auth feature implementation plan
(`.claude/plans/auth-templates-implementation.md`). The goal is to build the visual
foundation — Tailwind theme tokens, shared primitives, and two layout shells — with
**zero auth logic**, so it can be reviewed purely on look-and-feel against the source
design (Claude Design project "Screener Authentication Templates", `Auth Pages.dc.html`)
before any data-fetching or form logic is added in later phases.

Per the existing plan's scope note, only the **desktop** screen variants are in scope
(2a–2c, 3a–3g); the `1a`–`1j` compact/small-resolution card family in the design file is
out of scope (no mobile support), so Phase 1 only needs to implement **one** size scale,
not a responsive/parameterized one.

Exact values below were pulled directly from `Auth Pages.dc.html` (read via the
Claude Design MCP tools), not estimated.

## Design tokens

The project uses **Tailwind v4** (CSS-first config via `@import "tailwindcss"` in
`src/index.css`, no `tailwind.config.js`). Tokens are added as `@theme` custom
properties in `src/index.css`, which is the only place they need to live.

**Colors** (all confirmed in the desktop/showcase family of the design file):
- `--color-bg: #06080C` (page background)
- `--color-surface: #0A0E14` (card/frame background)
- `--color-surface-marketing: #070A0F` (split-layout left panel)
- `--color-input: #0D1219` (input background)
- `--color-border: rgba(255,255,255,0.09)` (card border)
- `--color-border-subtle: rgba(255,255,255,0.07)` (panel/header dividers)
- `--color-border-input: rgba(255,255,255,0.12)` (input default border)
- `--color-text: #F2F5FA` (headings)
- `--color-text-strong: #E7ECF4` (input text, wordmark)
- `--color-text-muted: #8A94A6` (body/subtitle/labels)
- `--color-text-dim: #556072` (placeholders, ticker meta)
- `--color-accent: #3EDC97` (buttons, links, focus border, brand mark — this is the
  fallback value actually used in the design's component logic; the editor metadata
  lists `#4EA8FF` as a separate "default" but that's inconsistent with what's actually
  applied everywhere, so `#3EDC97` is correct to use)
- `--color-accent-ink: #07100B` (text on accent-colored buttons)
- `--color-danger: #F26D6D`, `--color-warning: #F5B84D` (banner/error-state colors,
  used via `color-mix()` for tinted backgrounds/borders — see Banner below)
- Order book preview colors reuse `--color-accent` (up) and `--color-danger` (down) —
  no separate tokens needed.

**Typography**:
- Fonts: IBM Plex Sans (weights 400/500/600) for body/headings/buttons/inputs; IBM Plex
  Mono (same weights) for the brand wordmark, field labels (uppercase), and the ticker
  strip. Loaded via `<link>` tags in `index.html` (preconnect + stylesheet), not a CSS
  `@import`, to avoid the extra render-blocking round trip.
- `--font-sans: 'IBM Plex Sans', sans-serif`, `--font-mono: 'IBM Plex Mono', monospace`
- Desktop scale (the only one in scope): h1 `26px/600` (login/register form), `28px/600`
  (centered verify/inbox screens), marketing h2 `38px/600`; body/subtitle `14px`; labels
  `11px` uppercase mono, `letter-spacing:0.08em`; input/button text `15px`.

**Spacing/shape**: card border-radius `14px`; button/input/banner radius `8px`; card
shadow `0 24px 60px rgba(0,0,0,0.45)`; form card width `400px`; form field gap `18px`;
input padding `13px 14px`; button padding `14px`.

**Deliberate deviations from the raw mockup** (the mockup is a static design export, not
production CSS):
- Add real `:hover` and `transition` rules — the mockup only has a non-standard
  `style-hover` attribute that doesn't exist in real CSS.
- Add a real `:focus-visible` ring (accent-colored outline) — the mockup only swaps
  border-color on focus with no ring, which isn't sufficient for accessibility. This
  gets a final pixel/detail check in Phase 7 per the existing plan, but the base
  behavior should exist now, not be bolted on later.
- Use `color-mix(in oklab, ...)` directly for tinted banner backgrounds (matches the
  design file exactly and Tailwind v4's baseline already assumes modern browsers).

## Components to build

All in `src/components/` (flat, per the existing directory layout — these are shared
primitives, not feature-specific):

1. **`Button.tsx`** — `variant: 'primary' | 'outline'`, standard button props
   (`type`, `disabled`, `onClick`, etc.), full-width by default (matches every button in
   the design). Primary: `bg-accent text-accent-ink`. Outline: transparent bg,
   accent-colored border/text, tinted hover background. No loading spinner prop yet —
   not needed until Phase 3+ wires up real submissions; adding it now would be
   speculative.

2. **`TextField.tsx`** — label + input, `forwardRef` so it composes cleanly with React
   Hook Form's `register()` in later phases without changes to this component. Props:
   `label`, `error?: string`, rest spread to the native `<input>`. Border goes to
   `--color-danger`-tinted when `error` is set; label is the uppercase mono style.

3. **`Card.tsx`** — simple bg/border/radius/shadow wrapper, just a styled `<div>`.

4. **`Banner.tsx`** — `variant: 'error' | 'warning' | 'success'`, text-only (the design
   uses no icons in any banner state — confirmed across all 6 banner screens in the
   mockup). Renders children with the variant's tinted background/border/text color.

5. **`BrandMark.tsx`** — the diamond glyph (`10×10px` div, `bg-accent`,
   `rotate-45`) + "SCREENER" wordmark (mono, uppercase, `letter-spacing:0.24em`). No SVG
   in the source design — plain CSS shape, so no SVG needed here either.

6. **`TickerStrip.tsx`** — decorative, static mock data only (no real order book data
   exists yet). Renders a fixed list of symbol/price/up-down items
   (`BTCUSDT`, `ETHUSDT`, `SOLUSDT`, `BNBUSDT`, `XRPUSDT` from the mockup), no animation
   (the design itself has no `@keyframes` despite being called a "ticker" — it's a
   static row). `show?: boolean` prop so layouts can opt out.

7. **`layouts/SplitAuthLayout.tsx`** — used by login/register. Flex row: left marketing
   panel (`BrandMark`, headline, subtext, a small static decorative order-book preview
   card, optional `TickerStrip`) at `flex: 1.2`, right panel `flex: 1` centering a
   `children` slot (the 400px form `Card`).

8. **`layouts/CenteredAuthLayout.tsx`** — used by verify-email/check-inbox screens. A
   header bar (`BrandMark`, bottom border) above a `flex-1` centered `children` slot,
   with an optional `TickerStrip` pinned to the bottom.

## Preview routes (for visual review)

Add two throwaway routes directly in `src/App.tsx` (e.g. `/dev/split-preview`,
`/dev/centered-preview`) rendering each layout with placeholder `Card`/`Button`/
`TextField`/`Banner` content mimicking screens 2a and 2c/3e. These exist purely so the
result can be checked against the mockup in a browser; they get deleted once Phase 3–5
replace them with the real `/register`, `/login`, `/verify-email` pages.

## Files touched

- `index.html` — add Google Fonts `<link>` tags (IBM Plex Sans/Mono, 400/500/600)
- `src/index.css` — add `@theme` block with the tokens above
- `src/components/Button.tsx`, `TextField.tsx`, `Card.tsx`, `Banner.tsx`,
  `BrandMark.tsx`, `TickerStrip.tsx` — new
- `src/components/layouts/SplitAuthLayout.tsx`, `CenteredAuthLayout.tsx` — new
- `src/App.tsx` — add the two temporary preview routes

## Verification

- `npm run typecheck` and `npm run build` pass.
- `npm run dev`, visit `/dev/split-preview` and `/dev/centered-preview` in a browser,
  compare side-by-side against the `Auth Pages.dc.html` mockup (screens 2a and 2c/3e)
  for color, spacing, type, and card proportions.
- Manually tab through the preview forms to confirm the new focus-visible ring and
  hover transitions behave sensibly (these don't exist in the raw mockup, so there's
  nothing to visually diff them against — just a sanity check).
