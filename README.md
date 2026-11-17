# Avuneri — web app

The mobile-first web app for **Avuneri**, a private personal library and reading companion
(repository name: `book-tracker-frontend`). The REST API lives in
[`book-tracker-backend`](https://github.com/chineduknight/book-tracker-backend).

What exists so far:

- the signed-in app shell, navigation and design system (FE #15);
- registration, sign-in, logout and an account menu, with browser sessions handled by a server-side
  Backend-for-Frontend (FE #16);
- the Library: catalogue, books, physical copies, locations, categories, collections and the
  wishlist with acquisition (FE #17; see [docs/library-contract.md](docs/library-contract.md));
- Reading and Notes: reading sessions with progress, explicit completion and rereads, and private
  notes and highlights with search (FE #18; see
  [docs/reading-notes-contract.md](docs/reading-notes-contract.md));
- Lending and the Home dashboard: loans of physical copies with returns and history, per-copy loan
  status, and an API-derived overview (FE #19; see
  [docs/lending-dashboard-contract.md](docs/lending-dashboard-contract.md));
- final QA and launch preparation (FE #20): reflow at narrow widths and large text, Back/Forward
  with unsaved changes, a Firefox and WebKit critical path, and the go/no-go package below.

**Launch status: not deployed, no-go for production.** Start with
[docs/launch-readiness.md](docs/launch-readiness.md) (configuration, gaps and owner decisions,
hosting options, runbooks, gates), [docs/qa-matrix.md](docs/qa-matrix.md) (what is tested in which
browser, and the manual checks still to do) and
[docs/release-evidence.md](docs/release-evidence.md) (each go/no-go criterion with its evidence).

## Requirements

- Node **26.x** (`.nvmrc`; `engine-strict` rejects other versions) and npm 11.
- A local **MongoDB 8** for web sessions (Docker is easiest).
- The Book Tracker API running locally (port 3000 by default), for signing in.

## Getting started

```bash
nvm use
npm ci
docker run -d --rm --name avuneri-bff-mongo -p 127.0.0.1:27018:27017 mongo:8.0
cp .env.example .env.local      # then generate BFF_SESSION_ENCRYPTION_KEY as described inside
npm run dev                     # http://localhost:3100
```

The app uses port **3100** so it can run beside the API on 3000 (set in the `dev` and `start`
scripts, and `APP_ORIGIN` in `.env.local` must match it). In development, the session
store's indexes are created automatically on first use.

## Configuration

All variables are **server-only**; never give any of them a `NEXT_PUBLIC_` prefix. Missing or
invalid values fail closed. See [`.env.example`](.env.example).

| Variable                     | Purpose                                                                           |
| ---------------------------- | --------------------------------------------------------------------------------- |
| `APP_ORIGIN`                 | Exact origin readers use; the only origin allowed to sign in, register or log out |
| `API_BASE_URL`               | The API, including `/api/v1`                                                      |
| `BFF_SESSION_MONGODB_URI`    | Dedicated MongoDB database for web sessions (never the API's database)            |
| `BFF_SESSION_ENCRYPTION_KEY` | 32 random bytes, base64url: encrypts stored API tokens, keys session verifiers    |

Building needs none of them; they are read at request time.

## Scripts

| Script                                       | What it does                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------- |
| `npm run dev` / `build` / `start`            | Development server, production build, production server (port 3100)       |
| `npm run typecheck`                          | Generates Next.js route types, then runs `tsc` (strict)                   |
| `npm run lint` / `format:check`              | ESLint (zero warnings) / Prettier                                         |
| `npm test`                                   | Vitest unit and component tests                                           |
| `npm run test:integration`                   | Session store tests against a real, local, disposable MongoDB             |
| `npm run test:e2e`                           | Playwright on mobile and desktop Chromium (builds first when run locally) |
| `npm run test:e2e:cross-browser`             | The `@critical` journeys in Firefox (desktop) and WebKit (iPhone)         |
| `npm run test:accessibility`                 | Only the axe, theme and reduced-motion checks                             |
| `npm run check:bundle`                       | Scans `.next/static` for server-only values (run after a build)           |
| `npm run check:contrast`                     | WCAG contrast of every design-token pair                                  |
| `npm run session-store:indexes [-- --apply]` | Operator tool: verify (read-only) or create missing session indexes       |
| `npm run test:ci`                            | Everything CI runs, in order                                              |

### Real-backend tests

`npm run test:backend` and `npm run test:e2e` start the real Book Tracker API themselves from
`BACKEND_DIR`: a checkout of `book-tracker-backend` at the commit pinned in CI, with `npm ci` run
inside it. It runs against a disposable `book-tracker-fe-*` database on the local MongoDB, which is
dropped afterwards. Without `BACKEND_DIR` these commands fail rather than skip.

```bash
git clone https://github.com/chineduknight/book-tracker-backend ../backend-for-tests
git -C ../backend-for-tests checkout fea9c12e218f0322714f3e1c3139e494cbf90204 && (cd ../backend-for-tests && npm ci)
BACKEND_DIR=../backend-for-tests npm run test:backend
BACKEND_DIR=../backend-for-tests npm run test:e2e
```

The browser suite runs two app instances of its own: port 3300 against a fake of the API's auth
endpoints (for session faults such as outages, rate limits and short sessions) and port 3200 against
the real API (every library, reading, notes, lending and Home journey), plus the fake API on 3901
and the real API on 3002. None of them is 3100, the `npm run dev` port, so a running dev server and
the tests never meet. All four are defined once in `e2e/support/ports.ts` and can be overridden
with `E2E_FAKE_APP_PORT`, `E2E_REAL_APP_PORT`, `E2E_FAKE_API_PORT` and `E2E_REAL_API_PORT`.
Playwright never reuses a server that is already running: if one of these ports is busy, the run
fails instead of testing the wrong server. The real API allows 20 registrations per hour per
process, so each test worker signs in to one reader account.

First Playwright run: `npx playwright install chromium` (and `firefox webkit` for the
cross-browser projects). Integration and e2e tests expect MongoDB
on `127.0.0.1:27018` (override with `BFF_SESSION_TEST_MONGODB_URI` / `E2E_SESSION_MONGODB_URI`;
loopback only). E2E tests run against a local fake of the API's auth endpoints
(`e2e/support/fake-auth-api.mjs`), never a real account. The walkthrough spec writes screenshots
to `screenshots/` (git-ignored; CI uploads them as the `visual-walkthrough` artifact).

## Routes

| Route                                                                | Access     | Purpose                                                     |
| -------------------------------------------------------------------- | ---------- | ----------------------------------------------------------- |
| `/login`, `/register`                                                | Signed out | Sign in, create an account (signed-in readers go home)      |
| `/`                                                                  | Signed in  | Home: counts, attention, reading breakdown, recent activity |
| `/library` (+ books, locations, categories, collections, wishlist)   | Signed in  | The Library (FE #17)                                        |
| `/reading` (+ `/new`, `/[sessionId]`)                                | Signed in  | Reading history, starting, progress, finishing (FE #18)     |
| `/notes` (+ `/new`, `/[noteId]`, `/[noteId]/edit`)                   | Signed in  | Notes and highlights (FE #18)                               |
| `/api/library/*`, `/api/reading/*`, `/api/notes/*`, `/api/lending/*` | BFF        | One allowlisted API operation per route; never a proxy      |
| `/lending` (+ `/new`, `/[loanId]`, `/copies/[copyId]`)               | Signed in  | Loans, lending a copy, returns, a copy's history (FE #19)   |
| `POST /api/session/register`, `/login`, `/logout`                    | BFF        | Same-origin JSON only; return a safe profile, never tokens  |
| `GET /api/session/me`                                                | BFF        | The signed-in reader's name and email                       |

A signed-out visit to a private page redirects to `/login?next=<page>`; only known application paths
are accepted as `next`. The five tabs are defined once in
[`src/config/navigation.ts`](src/config/navigation.ts).

## How sign-in works (short version)

The browser holds one opaque, HttpOnly session cookie and talks only to this app. The app keeps the
API's access and refresh tokens server-side, AES-256-GCM encrypted in MongoDB, and calls the API with
`Authorization: Bearer`. Because the API's refresh tokens are single-use, exactly one request per
session (on any instance) may refresh, coordinated by an atomic claim in MongoDB. An uncertain
refresh ends the session instead of risking a replay. Full design, threat model, failure modes and
production prerequisites: [docs/auth-session-architecture.md](docs/auth-session-architecture.md).

## Project structure

```text
src/
  proxy.ts               CSP nonce + request path for server components (no authentication)
  app/
    (auth)/              /login, /register (public frame)
    (app)/               signed-in pages; every page calls requireSignedInProfile()
    api/session/         BFF route handlers
    error.tsx, not-found.tsx, layout.tsx, globals.css
  components/            auth forms, layout (shell, header, account menu), ui primitives, brand
  config/navigation.ts   the five destinations and the Library subsections
  lib/                   client-safe code: API transport, credential rules, safe redirects, CSP
  server/                server-only: config, auth adapter, sessions, HTTP handlers, logging
  test/                  fixtures (fake API auth, in-memory store) and integration helpers
e2e/                     Playwright specs and the fake auth API
scripts/                 bundle, contrast and session-index tools
docs/                    decisions and the auth/session architecture
```

## Design

A quiet, modern reading room: warm paper canvas, dark ink text, one deep green accent, serif
headings and a system sans body. There are no remote fonts, no images beyond icons and no analytics.
Every colour is a token in [`globals.css`](src/app/globals.css) with light and dark values that
follow the system preference. On phones a fixed bottom bar holds the five labelled tabs; from 768px
a sidebar does. See [docs/decisions.md](docs/decisions.md).

## Quality gates

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs on pull requests and `main` with a
MongoDB 8 service: `npm ci` → typecheck → lint → format → unit tests → session integration tests →
library contract tests against the pinned real API → contrast → build (sentinel configuration) →
bundle check → Playwright (real API and fake auth API) → production dependency audit.
A second job runs the `@critical` journeys in Firefox and WebKit with its own API process, and a
third runs a full-history gitleaks secret scan. There is no deployment step.
