# Frontend decisions

Decisions made in FE #15 (Frontend Foundation) and FE #16 (Avuneri branding, authentication and
sessions), with the reasoning, so later milestones can build on them or revisit them deliberately.

## Product name

The product is **Avuneri**. Repository and package names stay `book-tracker-frontend` and
`book-tracker-backend`. Branding is a typographic wordmark plus a simple open-book mark in the
existing palette; there are no remote fonts. The only remote images are book covers the reader
chose (see “Book covers” below).

## Separate repository

The frontend lives in its own repository, separate from `book-tracker-backend`, so Node/Express/
Mongoose server concerns stay apart from Next.js. The two share conventions (Node 26, strict
TypeScript, Prettier settings, Vitest, CI shape) but no code.

## Stack and versions

| Concern    | Choice                                             | Note                                                                                                                                                                                                                                                           |
| ---------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework  | Next.js 16.4 (App Router, `src/`), React 19.3      | Pinned exactly: a patched stable release matters for security fixes. No canary.                                                                                                                                                                                |
| Language   | TypeScript ~6.0, strict                            | `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. TS 7 is out, but `typescript-eslint` supports `<6.1`. Matches the backend.                                                                                                                           |
| Lint       | ESLint 9.39 + `eslint-config-next`                 | ESLint 10 is out, but Next's React/import/jsx-a11y plugins do not support it yet.                                                                                                                                                                              |
| Styling    | Tailwind CSS 4 via `@tailwindcss/postcss`          | Tokens are CSS variables exposed with `@theme inline`.                                                                                                                                                                                                         |
| Icons      | `lucide-react`                                     | Always decorative (`aria-hidden`), next to a visible text label.                                                                                                                                                                                               |
| Classes    | `clsx` + `tailwind-merge`                          | Only through `cn()` in `src/lib/utils.ts`.                                                                                                                                                                                                                     |
| Tests      | Vitest + Testing Library + jsdom; Playwright + axe |                                                                                                                                                                                                                                                                |
| Validation | `zod` 4 (server only)                              | Added in FE #16 for the auth request schemas (mirroring the API's exactly) and for validating API auth responses before any token is stored. The browser forms use small shared rules (`credential-policy.ts`) instead, so zod stays out of the client bundle. |
| Sessions   | `mongodb` 7.9 (pinned), `server-only`              | The durable BFF session store and the server/client boundary marker. `tsx` (dev) runs the operator index script.                                                                                                                                               |

**Deferred deliberately:** TanStack Query, any global state library, React Hook Form, charts,
shadcn/ui, Radix. FE #16's two forms and one disclosure menu did not need any of them. Each should be adopted, selectively, by the milestone that genuinely needs it.

## Routing: typed routes and a route group

`typedRoutes` is on, so a link to a page that does not exist is a type error. Private pages live in
the `(app)` route group, which owns the signed-in shell. `/login` and `/register` live in `(auth)`,
in the same public frame as errors and the 404 page, so a signed-out visitor never sees the
private navigation.

## One navigation element for every screen size

The bottom bar (phones) and the sidebar (from 768px) are the same `<nav>` restyled with
breakpoints, not two components toggled with CSS. So there is always exactly one set of primary
links and one `aria-current="page"`, the labels and order cannot diverge, and tests can assert
both.

- Active state: a tinted icon pill or row, a bold accent label, and `aria-current`. Colour is never
  the only signal.
- Targets are at least 44×44px, and labels wrap rather than clip under large text.
- `viewport-fit=cover` with `env(safe-area-inset-bottom)` padding clears the home indicator. `main`
  reserves the bar's height, so the last content is never hidden. `interactive-widget=resizes-content`
  keeps the bar above the on-screen keyboard.
- Focus on navigation: focus stays on the activated link, which is the predictable behaviour for
  persistent navigation. Next.js's route announcer reads the new page title. The skip link moves
  focus to `main`.

## Theme: system preference only

Light and dark follow `prefers-color-scheme`. A manual toggle would need a pre-hydration script and
persisted state to avoid a flash; it adds little at this stage, so it is not built. Because every
colour is a token, adding one later is a change to `:root` only.

## Honest placeholders

No page shows invented counts, sample books, fake borrowers, a fake search box or an Add button.
Every link goes to a real route. Unfinished areas say "Coming soon" and describe what will arrive.
`Input` is used by the sign-in forms since FE #16. `Skeleton` remains a tested primitive for FE #17,
unused until something genuinely loads.

## Authentication: a server-side BFF with a durable session store (FE #16)

The browser never holds an API token. It has one opaque HttpOnly cookie, and this Next.js app
calls the API with bearer tokens from server code. Sessions live in a dedicated MongoDB database,
encrypted, so any number of app instances can serve them. The design, threat model, refresh race
handling and operational prerequisites are in
[auth-session-architecture.md](auth-session-architecture.md).

Choices worth recording:

- **Durable store, not a sealed cookie.** A stateless encrypted cookie holding the refresh token
  could not coordinate single-use refresh across concurrent requests and instances. A lost
  `Set-Cookie` would also strand a rotated token. Process memory is never the source of truth.
- **One refresh per session, decided by MongoDB.** An atomic compare-and-swap claim with a fenced
  completion. An uncertain refresh ends the session rather than retrying the old token.
- **Route handlers, not Server Actions,** for sign-in, registration, logout and the current user.
  They are explicit, testable and carry an exact Origin check. There is no generic proxy to the API.
- **Authorization inside each page** (`requireSignedInProfile`), not only in a layout or the proxy,
  verified against the API (`/auth/me`) on every render.
- **No new UI libraries.** Forms are plain controlled inputs with shared validation rules.

Still not built: password reset, email verification, account settings or deletion, "log out
everywhere", MFA and social sign-in.

## Library interface (FE #17)

Recorded in detail in [library-contract.md](library-contract.md). The main decisions:

- **Server components read, route handlers write.** Pages load private data on the server per
  request, and client components write through explicit `/api/library/*` routes that share one
  hardened pipeline. There is no generic proxy, no Server Actions and no client-side data library.
  `router.refresh()` re-renders the affected view after a write, and nothing is optimistic.
- **The API's semantics, not invented ones.** No reading status, copy counts or availability.
  Duplicates are suggestions. Presets are suggestions. Membership order is the API's. There are no
  controls without an endpoint (location delete, reordering, un-acquiring).
- **Uncontrolled form fields.** Controlled inputs lost text typed before hydration (found by a
  flaky browser test under load). All forms now read values from the form element on submit, and
  React state holds only errors and live hints.
- **Plain, accessible primitives** (native select, textarea, `<dialog>`), with no new UI
  dependency. FE #17 adds no dependencies at all,
  and zod remains server-only.
- **Tested against the real API.** Contract tests and the library browser journeys run against
  `book-tracker-backend` pinned in CI, on disposable local databases. The fake auth API is kept
  only for session faults the real API cannot produce on demand.

## Reading and notes (FE #18)

Recorded in detail in [reading-notes-contract.md](reading-notes-contract.md). The main decisions:

- **Same architecture, new allowlisted routes.** `/api/reading/*` and `/api/notes/*` reuse the
  FE #17 pipeline; there is no second session mechanism. Note writes declare their own 100 kB body
  cap (the API's limit). Library stays at 32 KiB and authentication at 8 KiB, each enforced on
  streamed bytes.
- **No Markdown renderer.** Note source and quotations are shown as literal text with an honest
  label. Rendering untrusted Markdown safely needs a new dependency plus careful link, image and
  HTML configuration, for a cosmetic gain; it can be revisited as a product decision.
- **Explicit transitions only.** Finishing is a separate, confirmed action. Nothing auto-completes
  at the last page or invents a date. `in_progress` is never sent on PATCH. Rereads are new readings.
- **Degrade by section.** The book page loads reading and notes separately, so an outage there
  shows a section error instead of hiding a healthy book.
- **Calendar days as text.** Dates are never parsed into local `Date` objects for display.
- **Unsaved-work warning without autosave.** Links and Cancel ask before discarding; nothing is
  stored as a draft.
- **No new dependencies.**

## Lending and Home dashboard (FE #19)

Recorded in detail in [lending-dashboard-contract.md](lending-dashboard-contract.md). The main
decisions:

- **A loan is a copy's event, not a book's.** Lending goes book → copy → form, so the reader always
  picks the exact copy, and typing only starts once it is chosen (no text lost to navigation).
- **The API decides availability.** A copy's status is fetched on request (no fan-out) and an
  unknown status is never shown as "available"; the API's `409` settles concurrent lends.
- **One stated reference day for "overdue".** The ledger sends one explicit `asOf` (today in UTC, the
  API's default, unless chosen) so counts, rows and labels agree, and the page says which day it is.
- **No retries of creates; honest unknowns.** Creating a loan is not idempotent, so an unanswered
  request is reported as unconfirmed with a link to check, never resent.
- **Home reads, it never computes.** Each section loads independently from the dashboard endpoints;
  an outage is an error, never zeroes; the feed claims only creation events and shows no borrower
  or note text.
- **Only four browser routes**: create, copy status, edit, return. Pages read on the server, so no
  list or dashboard route is exposed to the browser. No new dependencies.

## Final QA and launch readiness (FE #20)

- **The shell adapts to room, not to the viewport.** The shell, header, bottom bar and `main` are
  CSS size containers, and layouts switch on their width in `rem` (named variants `shell-narrow`,
  `shell-wide`, …, and `@md` inside `main`). Enlarged text scales every `rem`, so it reaches the
  phone layout as a narrower screen does; a viewport media query cannot see text size. At 100%
  text the breakpoints equal Tailwind's.
- **At large text, compact rather than hidden.** The header keeps the logo and moves the brand name
  to screen-reader text; the bottom bar becomes two rows of three and two, dropping only the
  decorative icons. Functional labels are never hidden.
- **Layout tests look for what readers see**: overlap per line box, clipped labels, words split
  across lines, content-column width, 44×44 targets and focus obscured by the bars, not only
  horizontal scrolling. "No horizontal scrollbar" passed while the FE #19 header overlapped.
- **Focus is kept visible by CSS first** (`scroll-padding`), with a small script fallback for engines
  whose focus scrolling ignores it (WebKit).
- **Back/Forward with unsaved changes uses the Navigation API's cancelable traversals** and never
  manipulates history (no sentinel entries, no `pushState` traps), which could trap readers and
  confuse the router. It is enabled only where it was verified to ask every time and always let
  the reader leave (Chromium, Firefox). In WebKit a cancelled Back left later Back presses doing
  nothing, a trap, so WebKit browsers (identified by `navigator.vendor`) keep the plain behaviour;
  the gap is an owner decision (launch-readiness.md, D1).
- **A rejected overdue reference day is reported, never replaced.** Loans are not loaded and the
  rejected text is shown as text, with "Reset to today".
- **A tile whose link lists something else says so** inside the link ("Opens finished readings,
  where each reread is listed") rather than adding a unique-books view the API does not offer.
- **Firefox and WebKit run the `@critical` journeys in a separate CI job** with its own API process,
  because the API limits registrations per process.

## Book covers (owner decision, 2026-11-21)

A book's cover is shown from the `https:` address the reader saved, in place of the placeholder.
Until then reader-supplied URLs were only links, because loading an image makes the reader's
browser contact that site. The owner chose to show covers, with these limits:

- **The reader's browser fetches the image directly; Avuneri never downloads, proxies or stores
  it** (no Next.js image optimisation, which would fetch it server-side and add cost).
- **That site learns the reader's IP address and when the cover was viewed.** It is never told
  which Avuneri page asked: images use `referrerpolicy="no-referrer"`, and the app-wide
  `Referrer-Policy` is `strict-origin-when-cross-origin` anyway. Images below the fold load only
  when scrolled to.
- **https only.** The CSP's `img-src` is `'self' data: https:`; plain `http:` covers show the
  placeholder (an https site would block them as mixed content) but stay available as a link.
- **Failure is quiet:** a missing or broken image falls back to the placeholder, including one that
  failed before the page became interactive. Covers are decorative (`alt=""`): the title is always
  beside them.
- Wishlist items keep their cover as a link only, for now.

## API transport

See the README's "Backend integration" section for the interface. Choices worth recording:

- **Injected `fetch`** so tests and the session layer control the transport. There is no
  Axios and no generated client.
- **Allowlisted, encoded paths** (`apiPath`) and a validated base URL (https, or http on loopback
  only; no credentials, query or fragment; must end with `/api/v1`). The final URL is checked to
  stay under the base path.
- **`redirect: 'error'`** so a bearer token can never follow a redirect elsewhere.
  **`credentials: 'omit'`** and **`cache: 'no-store'`** match the API's cookie-less, no-store
  contract.
- **Typed, safe errors**: messages are fixed strings or the API's documented message. The original
  error is never attached as `cause`, because runtime network errors can include the host and port.
- **Timeout**: 15s by default, covering the whole response; long downloads opt out per request and
  remain cancellable.
- **No retries.** Automatic retries are unsafe for non-idempotent writes and for refresh-token
  rotation; a later milestone can add them deliberately for idempotent reads.

## Security headers

Every response sends `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: strict-origin-when-cross-origin` and a restrictive `Permissions-Policy`, and
`X-Powered-By` is off. Since FE #16, the proxy also sends an enforced Content-Security-Policy with a
fresh nonce per request and `'strict-dynamic'`: no `unsafe-inline`, and `unsafe-eval` only in
development. It sends HSTS when `APP_ORIGIN` is https. Nonces require per-request rendering, so the
root layout opts every page into dynamic rendering; private pages must never be prerendered anyway.
Pages are `noindex` (meta tag), and since FE #20 every response, JSON included, also sends
`X-Robots-Tag: noindex, nofollow, noarchive`; there is no `robots.txt` that would stop crawlers
from seeing it. Next.js telemetry is disabled in CI.
