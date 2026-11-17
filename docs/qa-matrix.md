# QA matrix

What is tested where, by what, and what has **not** been tested. Statuses: **pass** (automated,
green at the SHA in [release-evidence.md](release-evidence.md)), **manual: not run** (a person must
do it; no result is claimed), **n/a**. An axe pass is not proof of WCAG conformance, and
Playwright's WebKit is not Safari.

## Environments

| Where                           | Engine (version)           | Emulation                                                      | Source                                            |
| ------------------------------- | -------------------------- | -------------------------------------------------------------- | ------------------------------------------------- |
| CI, `ubuntu-latest`             | Chromium (Playwright 1.65) | Pixel 7 (mobile) and 1440×900 desktop                          | job "Typecheck, lint, test, build, browser tests" |
| CI, `ubuntu-latest`             | Firefox 159.0              | 1280×900 desktop (Playwright cannot emulate phones in Firefox) | job "Critical path in Firefox and WebKit"         |
| CI, `ubuntu-latest`             | WebKit 27.2                | iPhone 13 (touch, mobile viewport)                             | same job                                          |
| Local, macOS 26.5.2 (Apple M1)  | Chromium 159.0.8154.6      | as CI                                                          | full Chromium suite run by hand                   |
| Real devices and screen readers | —                          | —                                                              | **manual: not run** (below)                       |

## Critical paths by browser

`@critical`-tagged tests run in every engine; the full Chromium suite runs everything.

| Journey                                                                                             | Chromium | Firefox              | WebKit (iPhone)                                                            | Test                                          |
| --------------------------------------------------------------------------------------------------- | -------- | -------------------- | -------------------------------------------------------------------------- | --------------------------------------------- |
| Register, sign in (wrong password explained), return to the requested page                          | pass     | pass                 | pass                                                                       | `auth.spec.ts`                                |
| Logout; Back shows no private page                                                                  | pass     | pass                 | pass                                                                       | `auth.spec.ts`                                |
| Session revoked at the API; absolute expiry; concurrent tabs refresh once                           | pass     | pass                 | pass                                                                       | `auth.spec.ts`                                |
| Tokens never reach the browser; cross-site logout refused; CSP, headers, `noindex`                  | pass     | pass                 | pass                                                                       | `security.spec.ts`                            |
| Library journey: add and edit a book, copies, locations, groups, wishlist                           | pass     | pass                 | pass                                                                       | `library.spec.ts`                             |
| Missing and another reader's book: the same 404; reader text never runs                             | pass     | pass                 | pass                                                                       | `library.spec.ts`, `library-security.spec.ts` |
| Confirmation dialog traps focus; Escape returns it                                                  | pass     | pass                 | pass                                                                       | `library.spec.ts`                             |
| Reading: start, progress, finish explicitly, reread                                                 | pass     | pass                 | pass                                                                       | `reading.spec.ts`                             |
| Calendar days at UTC+14 and UTC−11                                                                  | pass     | pass                 | pass                                                                       | `reading.spec.ts`                             |
| Notes: Markdown kept literal, edit, search, delete; a ~14,000-character note typed before hydration | pass     | pass                 | pass                                                                       | `notes.spec.ts`                               |
| Lending: lend, return, lend again; rejected reference day                                           | pass     | pass                 | pass                                                                       | `lending.spec.ts`                             |
| Home: real counts from an empty account; "ever finished" counts a book once                         | pass     | pass                 | pass                                                                       | `home.spec.ts`                                |
| Shell at 320/360/390px and 100/150/200% text; landscape; 768/1024px                                 | pass     | pass (desktop sizes) | pass (phone sizes)                                                         | `shell-reflow.spec.ts`                        |
| Back/Forward ask before discarding unsaved changes, every time                                      | pass     | pass                 | **not guarded** (decision D1): Back leaves at once, never trapped (tested) | `history-guard.spec.ts`                       |

Chromium alone also runs: outages and rate limits on every section, ownership and origin checks on
every write route, pagination, every page's axe scan (light, dark, 320px, open dialogs and menus),
reduced motion, keyboard order and focus rings, and the visual walkthrough.

## Sizes and text

|                                                                | 100% text                                                                                                       | 150% text                                          | 200% text                                                     |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------- |
| 320 / 360 / 390px phone                                        | pass                                                                                                            | pass                                               | pass: logo-only header, two-row bottom bar, whole-word labels |
| 740×360 landscape                                              | pass                                                                                                            | pass                                               | pass: header scrolls away                                     |
| 768 / 1024px tablet                                            | pass: sidebar                                                                                                   | pass: bottom bar (column too narrow for a sidebar) | pass: bottom bar                                              |
| Long names (account menu), long titles, 20,000-character notes | pass                                                                                                            | —                                                  | pass                                                          |
| Light and dark                                                 | pass (axe, walkthrough)                                                                                         | —                                                  | captured                                                      |
| 400% browser zoom                                              | Equivalent to a 320px viewport at 100% (1280px ÷ 4), covered above; **manual check on a real browser: not run** |                                                    |                                                               |

"200% text" is simulated by setting the root font size, which scales every `rem` and the shell's
container queries. A browser's own text-size setting also scales media queries, so it reaches the
phone layout at least as early. Assertions check overlap, clipped labels, words split across lines,
content-column width, 44×44 targets and focus not obscured, as well as horizontal scrolling.

## Adverse conditions (automated)

| Condition                                                                    | Expected                                                                          | Where                                          |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------- |
| API down / 503 / 429 on reads                                                | "couldn't be loaded", with retry; never "zero", "available" or "no overdue loans" | `library-outage.spec.ts`                       |
| API 429/503 on writes                                                        | explained; nothing looks saved                                                    | `library.spec.ts`                              |
| No answer to a create                                                        | "outcome unknown" with a way to check; never retried automatically                | `lending.spec.ts`, `notes.spec.ts`, unit tests |
| 401 mid-session, revoked or expired session                                  | signed out, back to the page after sign-in                                        | `auth.spec.ts`, `library.spec.ts`              |
| 404 / another reader's id                                                    | the same "not found"                                                              | `library.spec.ts`, route tests                 |
| 409 (on loan, already returned, in progress, name taken)                     | fixed, allowlisted messages                                                       | route and component tests                      |
| Session store unavailable; missing or changed index                          | 503, fail closed                                                                  | session integration tests (MongoDB 8)          |
| Refresh races, uncertain refresh, logout during refresh, deleted session     | one refresh; uncertain ends the session; no revival                               | session integration tests                      |
| Double clicks on writes                                                      | one request (pending state is `aria-disabled`)                                    | component tests                                |
| Malformed ids, unknown or repeated params, oversized bodies, foreign origins | 400/403/413 before any API call                                                   | route tests, `library-security.spec.ts`        |

## Manual checks (not run)

None of these has been performed. Each needs a dated record (device, OS, browser and version,
tester, result, notes) added here, and screenshots with synthetic accounts only.

**macOS Safari + VoiceOver** (and iOS Safari + VoiceOver on a phone)

- [ ] Sign in, browse each tab, open a book; the rotor lists headings and landmarks; the current tab is announced once.
- [ ] Add a book with a validation error: the error is announced and focus moves to the first invalid field.
- [ ] Open and close "Mark returned…" and "Mark as finished…": focus moves in, Escape closes, focus returns.
- [ ] Type in a note, then press Back (and swipe back on iOS): Back leaves and the text is lost, as expected under D1. Record it, and whether anything else happens.
- [ ] 200% text (Safari "Make Text Bigger" and iOS Larger Text): no overlap; labels whole.
- [ ] Log out; Back shows no private page.

**Desktop Firefox and Chrome, keyboard only**

- [ ] Tab through every page: visible focus ring everywhere, logical order, no trap; the skip link works.
- [ ] Every form and dialog is usable without a mouse; Escape closes dialogs and the account menu.
- [ ] 400% zoom at 1280px: one column, no horizontal scrolling, nothing hidden behind the bars.

**Android phone + TalkBack** (if a device is available)

- [ ] Bottom bar: five labelled tabs, current one announced; double-tap targets are easy to hit.
- [ ] Record a loan and return it; dates are read as dates.
- [ ] On-screen keyboard open in the note editor: the field being edited stays visible.

**On-screen keyboard (any phone).** Not testable in CI: Chrome and Safari on phones keep the layout
viewport when the keyboard opens, so the bottom bar sits behind the keyboard rather than over the
field. To be confirmed on a device.
