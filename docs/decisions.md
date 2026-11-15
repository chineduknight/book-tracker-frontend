# Frontend decisions

Decisions made in FE #15 (Frontend Foundation) and FE #16 (Avuneri branding, authentication and
sessions), with the reasoning, so later milestones can build on them or revisit them deliberately.

## Product name

The product is **Avuneri**. Repository and package names stay `book-tracker-frontend` and
`book-tracker-backend`. Branding is a typographic wordmark plus a simple open-book mark in the
existing palette; there are no remote fonts or images.

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
Pages are `noindex`, and Next.js telemetry is disabled in CI.
