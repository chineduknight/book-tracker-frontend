# Launch readiness (frontend)

> **Status on 2026-11-17: NO-GO for production. Not yet ready to deploy to staging either: that
> needs the owner's approval of the items in section 7.** Nothing has been deployed, provisioned,
> purchased or connected. This document prepares decisions; it does not make them. Evidence for
> every check is in [release-evidence.md](release-evidence.md); browser and assistive-technology
> coverage is in [qa-matrix.md](qa-matrix.md).

The API's own operations documents are the source for the backend and the database. They are not
repeated here: [release checklist](https://github.com/chineduknight/book-tracker-backend/blob/main/docs/release-checklist.md),
[deployment runbook](https://github.com/chineduknight/book-tracker-backend/blob/main/docs/deployment-runbook.md),
[monitoring and budget](https://github.com/chineduknight/book-tracker-backend/blob/main/docs/monitoring-and-budget.md),
[index operations](https://github.com/chineduknight/book-tracker-backend/blob/main/docs/index-operations.md),
[backup and restore](https://github.com/chineduknight/book-tracker-backend/blob/main/docs/backup-and-restore.md),
[deployment decision](https://github.com/chineduknight/book-tracker-backend/blob/main/docs/deployment-decision.md)
(BE PR #14, merged 2026-11-16; backend `main` at `9e2d9ef`).

## 1. What runs where

```text
browser ──HTTPS──> Avuneri web app (Next.js 16, Node 26)       ──HTTPS──> Book Tracker API (Node 26)
                   pages, BFF route handlers, proxy (CSP)                   │
                   │                                                        └──> MongoDB (API database)
                   └──TLS──> MongoDB (session store: its own database and user)
```

- The browser holds one opaque, `HttpOnly` session cookie and talks only to the web app. API
  tokens live server-side, AES-256-GCM encrypted in the session store. Design, threat model and
  failure modes: [auth-session-architecture.md](auth-session-architecture.md).
- The web app needs a **Node.js 26 server runtime** (route handlers, the proxy, server rendering).
  Static hosting cannot run it. Any number of instances may run: all session state is in MongoDB
  and token refresh is coordinated there.
- Each private page makes 1 to about 4 API calls before responding (Home makes three section
  loads; lists look up the books they show, bounded at 4 in parallel). **Put the web app in the
  same region as the API**: every page pays the web-app-to-API round trip at least once.

## 2. Secure configuration

All variables are server-only and validated at request time; a missing or unsafe value fails
closed (503), and errors name the variable, never the value. Table and rules:
[auth-session-architecture.md §6](auth-session-architecture.md#6-keys-and-secrets) and
[`.env.example`](../.env.example).

Production requirements, each enforced by code or to be checked at Gate B:

| Requirement                                                                                                                                  | Enforced by                                                                       | Checked on a real host? |
| -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------- |
| `APP_ORIGIN` is the exact `https://` origin readers use                                                                                      | config validation; exact-Origin check on every write                              | Gate B                  |
| `API_BASE_URL` is `https://` and not loopback                                                                                                | config validation                                                                 | Gate B                  |
| Session store over TLS with certificate and hostname checks; `tlsInsecure`, `tlsAllowInvalid*` refused                                       | config validation; client forces `tls: true` for remote servers                   | Gate B                  |
| Session store is a **dedicated database with its own least-privilege user** (`readWrite` on that database only), never the API's credentials | operator                                                                          | Gate B                  |
| Session indexes built by the operator before traffic, then verified read-only; production never creates them on request                      | `npm run session-store:indexes [-- --apply]`; instances re-verify and fail closed | Gate B                  |
| `__Host-avuneri_session` cookie: `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, no `Domain`                                                 | code + unit tests                                                                 | **Gate B (real TLS)**   |
| HSTS (`max-age=63072000; includeSubDomains`) when `APP_ORIGIN` is https                                                                      | proxy                                                                             | Gate B                  |
| Enforced nonce CSP with `strict-dynamic`, no `unsafe-eval`/`unsafe-inline` in production                                                     | proxy + browser tests                                                             | Gate B                  |
| `no-store` on private pages and JSON; `X-Robots-Tag: noindex` on every response                                                              | headers + browser tests                                                           | Gate B                  |
| Encryption key generated straight into the host's secret store                                                                               | operator                                                                          | Gate B                  |
| NTP-synchronised clocks                                                                                                                      | host                                                                              | Gate B                  |

**Key rotation** ends every web session (readers sign in again) and cannot log the old sessions out
at the API; revoke them there if the key may have leaked
([§6](auth-session-architecture.md#6-keys-and-secrets)). **Logs** are structured lines with an
allowlist of fields (event, reason, status, the API's request id): no cookies, tokens, emails,
bodies, borrower details or upstream messages, by construction (`src/server/log.ts`).

## 3. Known gaps and decisions for the owner

| #   | Item                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Risk                                                                                                                              | Proposed handling                                                                                                                                                                                                                                                                                               | Owner decision                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| D1  | **Back/Forward with unsaved changes in Safari and on iOS.** Chromium and Firefox ask before Back or Forward discards a changed form, every time, and the reader can always leave (Navigation API, cancelable traversals; tested in CI). In Playwright's WebKit the first Back was cancelled correctly, but afterwards Back did nothing at all, even after more typing: a trap. So WebKit browsers (Safari, and every browser on iOS) are not guarded: Back leaves at once and discards the form, as before FE #20. Reload, close, links and Cancel still ask everywhere. Real Safari is **untested**. | A Safari or iOS reader who presses Back (or swipes back) loses unsaved text. Notes of up to 20,000 characters are the worst case. | Accept for V1. No history manipulation (fake entries, `pushState` traps) is used: it would trap readers and confuse the router. Later options, each needing its own review: re-test on real Safari and enable the guard there if it behaves; or a local, opt-in draft store (new scope, with a privacy review). | **Accepted by the owner, 2026-11-27** |
| D2  | **API authentication limits are shared by all readers** (BFF egress = one client address). 100 auth requests per 15 min for everyone; each active reader refreshes about every 14 min, so roughly 90 readers active at the same time would use the budget on refreshes alone (arithmetic, not measured).                                                                                                                                                                                                                                                                                              | Sign-in, sign-up and refresh failures for everyone at modest scale.                                                               | Accept for a small private V1, or approve an API/edge change ([auth-session-architecture.md §9.3](auth-session-architecture.md#9-production-prerequisites-and-open-operational-decisions)). Measure with synthetic readers on staging.                                                                          | **Needed before launch**              |
| D3  | Dev-only advisory GHSA-g3hv-75wg-m249 (`minimatch` via `typescript-eslint`, moderate). The fix (`typescript-eslint` 8.73.0) was published 2026-11-16.                                                                                                                                                                                                                                                                                                                                                                                                                                                 | ESLint only, on this repository's own patterns; never shipped.                                                                    | Update after 2026-11-30, once the release has aged two weeks.                                                                                                                                                                                                                                                   | Noted                                 |
| D4  | Hosting, region, budget ceiling, Atlas tier, backup tier for the API database                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | —                                                                                                                                 | Section 5; BE #14 deployment decision                                                                                                                                                                                                                                                                           | **Needed before staging**             |
| D5  | Real-backend test pin stays at `fea9c12`; backend `main` is at `9e2d9ef` (BE #14: operations only, no contract change recorded)                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Staging would run a newer API than CI tests                                                                                       | Repin deliberately with a contract run before staging                                                                                                                                                                                                                                                           | Before staging                        |

## 4. Performance (measured, not estimated)

Measured on 2026-11-17 against the production build with the real API and local MongoDB on one
machine (Apple M1, macOS 26.5.2, Node 26.13.1, Chromium 159). Slow-4G profile: 150 ms latency,
1.6 Mbit/s down, 750 kbit/s up, 4× CPU slowdown, cache disabled, 390×844.

| Route                                     | Server time (median of 5, unthrottled) | First contentful content (LCP) | Load     | HTML    | JS       | Total transfer |
| ----------------------------------------- | -------------------------------------- | ------------------------------ | -------- | ------- | -------- | -------------- |
| `/login`                                  | 65 ms                                  | 764 ms                         | 1,602 ms | 16.1 KB | 158.7 KB | 200 KB         |
| `/` (Home, three API section loads)       | 43 ms                                  | 584 ms                         | 1,459 ms | 16.0 KB | 158.7 KB | 200 KB         |
| `/library`                                | 31 ms                                  | 584 ms                         | 1,456 ms | 14.6 KB | 158.7 KB | 194 KB         |
| `/library/books/:id` (21 copies)          | 42 ms                                  | 576 ms                         | 1,488 ms | 15.8 KB | 168.1 KB | 206 KB         |
| `/reading`                                | 46 ms                                  | 580 ms                         | 1,453 ms | 12.1 KB | 161.7 KB | 193 KB         |
| `/notes/:id/edit` (19,900-character note) | 35 ms                                  | 624 ms                         | 1,528 ms | 11.4 KB | 165.9 KB | 194 KB         |
| `/lending`                                | 40 ms                                  | 652 ms                         | 1,459 ms | 11.5 KB | 158.7 KB | 194 KB         |
| `/lending/new?bookId=:id`                 | 30 ms                                  | 576 ms                         | 1,503 ms | 9.9 KB  | 167.4 KB | 196 KB         |

Sizes are compressed transfer sizes. **Not measured, and needed on staging:** the web-app-to-API
and API-to-database round trips across a real network (here both were on loopback, so server
time is a floor), cold starts on the chosen host, memory, and latency from Nigeria.

Cost-relevant facts: no `next/image` (no image-transform charges); `/_next/static` assets are
content-hashed; every private page and JSON response is `no-store` and must stay uncached by any
CDN; Next.js prefetches in-viewport links in production (default behaviour, same-origin, a few
small requests per page).

## 5. Hosting options (documentation only: no account, no signup)

Prices read from the vendors' official pages on **2026-11-17**; re-check on the day an account is
created. They exclude VAT/sales tax and foreign-exchange charges on a Nigerian card. No provider is
assumed free indefinitely.

| Need                 | Vercel                                                                                                                                                                              | Render                                                                                         | Railway                                | Fly.io                                                                                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Node 26              | **GA, default for new projects** ([changelog](https://vercel.com/changelog/node-js-26-lts-is-now-generally-available-on-vercel))                                                    | Not documented; default 24.22.1 ([docs](https://render.com/docs/node-version)); must be proven | Not confirmed (BE #14)                 | Any (container image)                                                                                                                                  |
| Price for this app   | Hobby $0 (usage caps; check the terms for commercial use before relying on it); Pro $20/month incl. $20 usage, $20 per extra developer seat ([pricing](https://vercel.com/pricing)) | Starter $7/month (0.5 CPU, 512 MB); Free sleeps after 15 idle min (BE #14)                     | Hobby $5/month incl. $5 usage (BE #14) | shared-cpu-1x 512 MB $3.69/month, 1 GB $6.70 (iad); fra 1 GB $7.73; no free tier, bills under $5 waived ([pricing](https://docs.fly.io/about/pricing)) |
| Spend guardrail      | Default on-demand budget $200, optional pause at 100% (hard limit)                                                                                                                  | —                                                                                              | Hard usage limit (min $10)             | —                                                                                                                                                      |
| Regions near Nigeria | Function region must be set next to the API (Frankfurt)                                                                                                                             | Frankfurt                                                                                      | Amsterdam                              | Frankfurt; **Johannesburg (jnb) listed**, Africa egress $0.12/GB                                                                                       |
| Fit with this app    | Serverless functions; MongoDB session store and refresh coordination already work across instances; egress IPs are not fixed (Atlas IP list)                                        | Long-running process, simplest; same host as the API if Render is chosen                       | Long-running process                   | Long-running process                                                                                                                                   |

**Candidate staging plan (for approval, not executed):** the web app on the same provider and
region as the API chosen in BE #14 (Render or Railway, Frankfurt/Amsterdam), or Vercel Pro with
functions pinned to Frankfurt; the session store as a separate database and user (on the API's
Atlas cluster if M0 is chosen, BE #14 §3); synthetic data only; auto-deploy off; a stated monthly
ceiling. Measure latency from Nigeria (and from Johannesburg if Fly.io is considered) before fixing
the region.

## 6. Runbooks (prepared, not executed)

- **Health:** there is no separate health route; the host's check should request `/login` without
  a cookie. That renders without calling the API or the session store, but does validate the
  configuration, so a misconfigured instance fails the check. A failing session store shows as 503
  on sign-in and on private pages, never as signed-out data. Watch the 5xx rate and the
  `session.store_unavailable`, `session.refresh_uncertain`, `library.backend_unavailable` and
  `bff.config_invalid` log events.
- **Error budget (proposal):** fewer than 1% of requests answered 5xx over a day; any
  `bff.config_invalid` is an immediate incident (misconfiguration).
- **Session store backups:** sessions are disposable. Losing the store signs everyone out and loses
  no reader data, so no backup is proposed; reader data lives in the API database, whose backups
  are BE #14's. Index verification is the operator's job before traffic.
- **Incidents:** API outage → pages show "couldn't be loaded" and writes fail visibly; nothing to do
  in the web app. Session store outage → readers cannot sign in; restore the store, no data repair
  needed. Suspected key leak → rotate the key (all readers sign in again) and revoke API sessions.
  Escalation: the owner is the only operator; record the incident and the request ids.
- **Secret rotation:** encryption key as above. API URL or origin change → update the variable,
  redeploy, then confirm sign-in and one write.
- **Rollback:** redeploy the previous release of the web app. **Code rollback and database restore
  are separate decisions**: the web app has no schema, and an earlier release reads the same
  sessions. Never drop indexes to roll back. A rollback across a key change signs everyone out.

## 7. Gates

**Gate A (this PR, no external side effects).** Fixes and tests in local and disposable CI
resources; these documents; PR opened for review. No merge, deployment, DNS, provisioning,
purchase, index build on a shared database or production data.

**Gate B (staging), only after the owner approves:** the exact commit(s), host, region, monthly
ceiling and the resources to be created. Then: deploy the web app and the API with synthetic data
and separate secrets, users and databases; auto-deploy off. Verify on the real host: HTTPS and the
`__Host-` cookie attributes, security headers, `APP_ORIGIN`/`API_BASE_URL`, sign-in, refresh and
logout in each browser; session indexes built and verified; BE #14's staging gates (readiness,
proxy hop count and forged headers, Node 26, indexes read-only check, SIGTERM drain, backup and
restore rehearsal, RPO/RTO, uptime and spend alerts); the shared-address rate limit with several
synthetic readers (D2); latency from Nigeria; the manual Safari, VoiceOver and TalkBack checks
(qa-matrix.md); a rehearsed code rollback.

**Gate C (production), after another explicit approval:** Gate B passed; D1 and D2 decided in
writing; budget alerts, backups, restore, observability and a support contact in place; the
release SHA(s), hosts, DNS, URL, date and rollback trigger approved; post-launch smoke checks and
the rollback owner named before any traffic.
