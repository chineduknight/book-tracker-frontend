# Frontend decisions

Decisions made in FE #15 (Frontend Foundation), with the reasoning, so later milestones can build
on them or revisit them deliberately.

## Separate repository

The frontend lives in its own repository, separate from `book-tracker-backend`, so Node/Express/
Mongoose server concerns stay apart from Next.js. The two share conventions (Node 26, strict
TypeScript, Prettier settings, Vitest, CI shape) but no code.

## Stack and versions

| Concern    | Choice                                             | Note                                                                                                                                                                                 |
| ---------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Framework  | Next.js 16.4 (App Router, `src/`), React 19.3      | Pinned exactly: a patched stable release matters for security fixes. No canary.                                                                                                      |
| Language   | TypeScript ~6.0, strict                            | `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. TS 7 is out, but `typescript-eslint` supports `<6.1`. Matches the backend.                                                 |
| Lint       | ESLint 9.39 + `eslint-config-next`                 | ESLint 10 is out, but Next's React/import/jsx-a11y plugins do not support it yet.                                                                                                    |
| Styling    | Tailwind CSS 4 via `@tailwindcss/postcss`          | Tokens are CSS variables exposed with `@theme inline`.                                                                                                                               |
| Icons      | `lucide-react`                                     | Always decorative (`aria-hidden`), next to a visible text label.                                                                                                                     |
| Classes    | `clsx` + `tailwind-merge`                          | Only through `cn()` in `src/lib/utils.ts`.                                                                                                                                           |
| Tests      | Vitest + Testing Library + jsdom; Playwright + axe |                                                                                                                                                                                      |
| Validation | No `zod` yet                                       | The only runtime check needed is the response envelope, which needs a few small guards. DTO schemas can arrive with the features that use them, through the client's `parse` option. |

**Deferred deliberately:** TanStack Query, any global state library, React Hook Form, charts,
shadcn/ui, Radix. Each should be adopted, selectively, by the milestone that genuinely needs it.

## Routing: typed routes and a route group

`typedRoutes` is on, so a link to a page that does not exist is a type error. All shell pages live
in the `(app)` route group, which leaves room for FE #16 to add sign-in pages with a different
layout without moving any URL.

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
`Skeleton` and `Input` are tested primitives for FE #16/#17. They are not shown, because nothing
loads and there is no form yet.

## Authentication is deferred to FE #16

FE #15 contains no sign-in, no token storage and no protected data. The API issues JSON bearer
tokens: a 15-minute access token and a 30-day rotating, single-use refresh token with reuse
detection. Browser storage for those is the open decision.

Rules already in force:

- Never put access or refresh tokens in `localStorage`, `sessionStorage`, IndexedDB,
  client-readable cookies, URLs, analytics or logs.
- The API client accepts a token source only outside the browser (it throws if `window` exists).
- No `NEXT_PUBLIC_` configuration, no blind `/api/*` proxy and no mutating Server Actions.

Recommendation to evaluate in FE #16: a **server-side Backend-for-Frontend** in Next.js. The browser
holds only an HttpOnly, Secure, SameSite session cookie. Next.js server code keeps the refresh token
server-side, exchanges it with the API and calls the API with the bearer token. Mutations get
origin/CSRF protection. Compare it with direct browser-to-API calls, which would need the backend's
CORS (`credentials: false` today) and token-delivery semantics to change. Settle the hosting and
CORS configuration from BE #14 first. Refresh calls must be serialised, because a reused refresh
token revokes the whole session.

## API transport

See the README's "Backend integration" section for the interface. Choices worth recording:

- **Injected `fetch`** so tests and the future session layer control the transport. There is no
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
`X-Powered-By` is off. A Content-Security-Policy is left for FE #16, once the session design fixes
which origins the app talks to. Pages are `noindex`, and Next.js telemetry is disabled in CI.
