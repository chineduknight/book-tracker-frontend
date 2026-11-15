# Book Tracker — frontend

The mobile-first web app for Book Tracker, a private personal library and reading companion. The
REST API lives in [`book-tracker-backend`](https://github.com/chineduknight/book-tracker-backend).

This is the **foundation** (roadmap milestone FE #15): the app shell, navigation, design system and
a typed API transport. It has **no sign-in, no live data and no backend calls yet**. Every page is
an honest placeholder for the milestone that fills it.

## Requirements

- Node **26.x** (`.nvmrc`; `engine-strict` rejects other versions) and npm 11.
- No environment variables are needed to develop, build or test FE #15.

## Getting started

```bash
nvm use
npm ci
npm run dev        # http://localhost:3100
```

The app uses port **3100** so it can run beside the API, which defaults to port 3000.

## Scripts

| Script                       | What it does                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| `npm run dev`                | Development server on port 3100                                                    |
| `npm run build`              | Production build                                                                   |
| `npm run start`              | Serves the production build on port 3100                                           |
| `npm run typecheck`          | Generates Next.js route types, then runs `tsc` (strict)                            |
| `npm run lint`               | ESLint (Next.js core-web-vitals + TypeScript rules), zero warnings allowed         |
| `npm run format:check`       | Prettier check (`npm run format` to fix)                                           |
| `npm test`                   | Vitest unit and component tests                                                    |
| `npm run test:e2e`           | Playwright on mobile (Pixel 7) and desktop Chromium; builds first when run locally |
| `npm run test:accessibility` | Only the axe accessibility, theme and reduced-motion checks                        |
| `npm run check:bundle`       | Scans `.next/static` for server-only values (run after a build)                    |
| `npm run test:ci`            | Everything CI runs, in order                                                       |

First Playwright run: `npx playwright install chromium`. The walkthrough spec writes screenshots to
`screenshots/` (git-ignored; CI uploads them as the `visual-walkthrough` artifact).

## Routes

| Route                  | Primary tab | Purpose (milestone)                               |
| ---------------------- | ----------- | ------------------------------------------------- |
| `/`                    | Home        | Overview, recent activity, quick actions (FE #19) |
| `/library`             | Library     | Catalogue, physical copies, locations (FE #17)    |
| `/library/categories`  | Library     | Categories (FE #17)                               |
| `/library/collections` | Library     | Collections (FE #17)                              |
| `/library/wishlist`    | Library     | Wishlist (FE #17)                                 |
| `/reading`             | Reading     | Current reads, sessions, progress (FE #18)        |
| `/notes`               | Notes       | Notes, highlights, search (FE #18)                |
| `/lending`             | Lending     | Active, overdue and returned loans (FE #19)       |

The five tabs are defined once in [`src/config/navigation.ts`](src/config/navigation.ts).
Categories, Collections and Wishlist are Library subsections, and Library stays the active tab on
them. Account settings will sit in the header's reserved slot rather than becoming a sixth tab.

## Project structure

```text
src/
  app/
    layout.tsx           html/body, metadata, viewport, skip link
    not-found.tsx        404 inside the app shell
    (app)/               every page that uses the app shell
      layout.tsx         AppShell
      error.tsx          route error boundary (never shows error details)
      page.tsx, library/, reading/, notes/, lending/
    globals.css          design tokens (light + dark) and base styles
  components/
    layout/              AppShell, SiteHeader, PrimaryNavigation, LibrarySectionPage
    ui/                  Button/ButtonLink, Badge, Card/LinkCard, PageHeader, SectionHeader,
                         EmptyState, InlineError, Skeleton, Input
  config/navigation.ts   the five destinations and the Library subsections
  lib/api/               typed API transport (see below)
  lib/utils.ts           cn(): clsx + tailwind-merge
  test/                  Vitest setup and fixtures
e2e/                     Playwright specs
scripts/                 bundle and colour-contrast checks
docs/decisions.md        design and architecture decisions
```

## Design

A quiet, modern reading room: warm paper canvas, dark ink text, one deep green accent, serif
headings and a system sans body. There are no remote fonts, no images beyond icons and no
analytics. Every colour is a token in [`globals.css`](src/app/globals.css) with a light and a dark
value. The theme follows the operating system preference, with no toggle and so no theme flash.
`node scripts/check-contrast.mjs` verifies WCAG AA contrast for each token pair.

Layout: a fixed bottom bar with five labelled icons on phones, and a persistent left sidebar from
768px. Both are the same `<nav>` restyled, so there is always exactly one set of links and one
`aria-current="page"`. See [docs/decisions.md](docs/decisions.md) for the reasoning.

## Backend integration

`src/lib/api` is ready for later milestones but **is not called by any page yet**.

- `createApiClient({ baseUrl, fetchImpl?, getAccessToken?, timeoutMs? })` with `get`, `getPage`,
  `post`, `put`, `patch`, `delete` and `request`.
- Paths are built with the `apiPath` template tag (`` apiPath`/books/${id}` ``). Each value is
  URI-encoded as exactly one segment, and the first segment must be a known API resource.
- It decodes the documented `{ data }`, paginated `{ data, meta.pagination }`, `204` and
  `{ error: { code, message, requestId, details } }` envelopes into results or typed errors:
  `ApiError` (HTTP), `ApiNetworkError`, `ApiAbortError` (cancelled/timeout) and `ApiProtocolError`.
  Error messages never include bodies, URLs or tokens.
- Requests use `cache: 'no-store'`, `credentials: 'omit'` and `redirect: 'error'`, with a 15s default
  timeout. A download such as an export can pass `timeoutMs: false`.

Assumptions taken from the backend's `docs/api-contract.md`: the base path is `/api/v1`, auth is
bearer tokens in JSON (not cookies), CORS is `credentials: false`, and private responses are
`no-store`.

**Not wired yet, on purpose:** sign-in, token storage and refresh, protected routes and every
data endpoint. How the browser holds a session (likely a Next.js server-side BFF with HttpOnly
cookies) is the FE #16 decision; see [docs/decisions.md](docs/decisions.md#authentication-is-deferred-to-fe-16).

### Environment

| Variable       | Where       | Purpose                                                             |
| -------------- | ----------- | ------------------------------------------------------------------- |
| `API_BASE_URL` | Server only | API base including `/api/v1`. Unused in FE #15; see `.env.example`. |

Never expose API configuration through a `NEXT_PUBLIC_` variable. CI builds with a sentinel
`API_BASE_URL`, and `npm run check:bundle` fails if it (or any token, `/api/v1` or a `NEXT_PUBLIC_`
name) reaches the browser bundle.

## Quality gates

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs on pull requests and `main`:
`npm ci` → typecheck → lint → format check → unit tests → build → bundle check → Playwright (mobile
and desktop Chromium) → `npm audit --omit=dev --audit-level=high`.

The Playwright suites cover routes and headings, navigation state, the keyboard (skip link, focus
ring, no traps), layouts at 320, 390, 768, 1024 and 1440px, doubled text size, axe WCAG 2.2 AA checks
in light and dark, reduced motion, security headers, and the absence of any cross-origin or API
request.
