# Frontend Architecture — Foundation & Context

> **Purpose**: This is a high-level starting point for the screener frontend — a *proposed*
> direction, not a locked-in mandate. It captures the current tech-stack thinking, the
> architectural ideas, and the feature landscape so any future session shares the same context.
> The recommendations here are considered but not final: with more knowledge and as the product
> evolves, some of these choices may well change. Treat them as a strong default to build on and
> revisit, not a rulebook.
>
> This is **not** an implementation plan — it contains no API contracts, WebSocket message shapes,
> or component-level specifications. Those live in separate, concrete plan documents. Read this to
> understand *what the frontend is* and *why this direction is suggested*.

---

## 1. What the Frontend Is

The screener frontend is a **real-time trading terminal** for the crypto market screener backend.
Its job is to display accurate, live order book data, let users tune how that data is analyzed,
and handle subscription access and payments.

The current frontend is a single hand-written `index.html` with no framework. The intent is to
rebuild it on a professional foundation designed to scale with the product; this document sketches
a direction for that rebuild.

The defining characteristic of this app is the combination of two very different workloads under
one roof:

- A **high-frequency real-time surface** (the order book) that must stay fast and accurate.
- A conventional **CRUD + transactional surface** (rules configuration, payments) that must stay
  correct and maintainable.

The architecture is chosen so that neither compromises the other.

---

## 2. Tech Stack

| Concern | Choice |
|---|---|
| Framework | **React** |
| Language | **TypeScript** |
| Build / dev tooling | **Vite** |
| Real-time client state | **Store outside React** (e.g. Zustand or a hand-rolled store) |
| Server state / data fetching | **TanStack Query** |
| Forms & validation | **React Hook Form + Zod** |
| Routing | **React Router** |
| Charts (future) | **TradingView (Lightweight Charts)** |
| Styling | **Tailwind CSS** (or CSS Modules) |

The leaning is toward a plain **single-page application** — no server-side rendering
meta-framework. It is an authenticated, socket-driven terminal with no obvious SEO or SSR needs, so
an SSR layer would likely add complexity with little benefit. This could be reconsidered if, say, a
marketing site later shares the codebase.

---

## 3. Why This Stack

The reasoning behind each pick is below. TypeScript is the one recommendation held with high
conviction; the rest are sensible defaults that a future session may refine.

### TypeScript — the strong recommendation

The frontend consumes precise backend contracts (order book messages, order/payment DTOs,
classification rules) and drives several state machines (payment lifecycle, order book sync
status). TypeScript models these contracts and state transitions at compile time, catching whole
classes of bugs — renamed fields, missing cases, malformed payloads — before they reach runtime.
For a data-and-money application this is a correctness requirement, not a convenience.

### React — for the ecosystem and the escape hatches

React is the suggested framework for reasons specific to this app (another mainstream framework
could work, but these points tilt the recommendation toward React):

- **Finance/charting ecosystem.** The planned charting work points directly at TradingView's
  React-first tooling. The broader real-time/trading component ecosystem is strongest on React.
- **Performance escape hatches.** React offers clean, well-documented ways to *opt out* of its
  render cycle (refs, imperative updates, external stores). The order book depends on exactly this
  capability (see §4).
- **Ecosystem depth and assistance.** More examples, libraries, and AI/tooling support — valuable
  while building an unfamiliar domain.

### Vite — modern default

Fast dev server, instant hot reload, near-zero configuration. The current standard for React SPAs.

### Supporting libraries

- **TanStack Query** owns all REST interaction: caching, retries, and polling (the payment flow
  polls order status). It keeps server state out of ad-hoc component state.
- **React Hook Form + Zod** power the forms. Zod schemas double as runtime validators and as the
  source of TypeScript types, and let the client mirror the backend's validation rules.

---

## 4. The Core Architectural Idea: Keep the Firehose Out of React

Of everything in this document, this is the idea worth holding onto most firmly — not because the
exact mechanics are fixed, but because the underlying concern is real regardless of the tools
chosen. The key design question is how real-time order book data flows through the app.

The backend pushes classified order book updates continuously. A naive frontend that funnels every
update into React component state and re-renders the tree on each message will drop frames and
saturate the CPU once many price levels across many symbols are updating at once. This is the
failure mode that kills naive real-time UIs.

The suggested way to avoid it is **decoupling the real-time data layer from React's render
cycle**:

```
   WebSocket ──► plain client-side store  (NOT React component state)
                        │
                        ├─► notifications / text-to-speech (subscribe to diffs)
                        │
                        └─► React UI subscribes selectively
                            (only what is on screen updates; hot surfaces
                             update imperatively / via canvas, not full tree renders)
```

Principles that follow from this:

- The live order book state lives in a **store outside React**. The socket writes to it directly.
- React reads via **fine-grained, selective subscriptions** — only the visible surface reacts to a
  given update, never the whole tree.
- The hottest surface (the order book grid) is expected to update via an **imperative / canvas
  rendering path** rather than reconciling a large React list on every tick. Start with plain DOM
  and virtualization; move to canvas rendering if profiling requires it.
- Derived real-time features — notifications and text-to-speech alerts on new or removed orders —
  subscribe to the store's changes, **independently of rendering**.

This principle applies only to the high-frequency surface. The CRUD and payment surfaces use
ordinary React state and TanStack Query — there is no reason to over-engineer them.

---

## 5. Feature Landscape (High-Level)

The frontend covers four areas. Only the first is performance-critical; the rest are conventional.

### 5.1 Order Book (the complex, speed-critical feature)

The flagship feature and the hardest one. It renders live order books, continuously updated from
the backend, and must stay fast and accurate under a heavy update rate. Beyond display, it detects
meaningful changes — new significant orders appearing, existing ones disappearing — and surfaces
them as **notifications** and optional **spoken alerts (text-to-speech)**. This is the surface the
architecture in §4 exists to serve.

### 5.2 Classification Rules

A per-user CRUD surface for configuring how order book levels are analyzed and ranked in
importance. Users define their own thresholds; the UI presents forms, validates input against the
backend's rules, and manages the user's rule sets. Conventional forms-and-data work.

### 5.3 Monetization & Access

Handles free trials, subscription plans, and payments. The UI presents plans, initiates purchases,
redirects users to the hosted payment flow, and reflects access/subscription state back to the
user. It follows the backend's payment lifecycle — including polling for the outcome of a payment
rather than trusting the browser redirect.

### 5.4 Charts (future)

Graphical market analysis will be added later. It will most likely be built on **TradingView**.
Details are intentionally out of scope for this document.

