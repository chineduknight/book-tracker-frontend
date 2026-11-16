# Library interface: routes, API endpoints and contract decisions

FE #17. Every library read and write goes through this app's server. The browser never calls the
Book Tracker API and never holds a token (see [auth-session-architecture.md](auth-session-architecture.md)).
Contract source: `book-tracker-backend` `main` at `fea9c12`, `docs/api-contract.md` and the module
schemas. CI tests against that exact commit.

## How data flows

- **Pages** (server components) read through `loadAsReader` → `sessions.callAsReader` → one function
  in `src/server/library/library-api.ts` per endpoint. Every response is validated with the DTO
  schemas in `library-schemas.ts`. A result is `ok`, `not-found` (rendered as the in-shell 404) or
  `unavailable` (an error panel with **Try again**, never an empty list).
- **Writes and pickers** (client components) call `/api/library/*` route handlers. Each route file
  binds one operation from `library-operations.ts`, and `library-route.ts` applies one pipeline:
  exact-Origin CSRF on every non-GET method → 24-hex ids → a strict JSON body (32 KiB cap) or a
  strict query allowlist → the reader's session → exactly one API call → sanitized errors →
  `Cache-Control: no-store`. A 204 is passed on with no body. It is never a generic proxy.
- After a successful write the client calls `router.refresh()` (or navigates), so the server
  re-renders the affected private view. Nothing is updated optimistically.

## Route matrix

| Page                                  | Reads (API)                                                                                                                                                              | Writes (BFF → API)                                                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `/library`                            | `GET /books?page&limit&q&format&sort`                                                                                                                                    | —                                                                                                                  |
| `/library/new`                        | —                                                                                                                                                                        | `POST /api/library/books` → `POST /books`; `GET /api/library/books/duplicates` → `GET /books/duplicate-check`      |
| `/library/books/[id]`                 | `GET /books/:id`, `GET /books/:id/copies` (physical only), `GET /locations` (all pages), `GET /books/:id/organization`, `GET /categories` and `/collections` (all pages) | `DELETE /books/:id`; `POST /books/:id/copies`; `PATCH`/`DELETE /copies/:id`; `PUT`/`DELETE /{kind}/:gid/books/:id` |
| `/library/books/[id]/edit`            | `GET /books/:id`                                                                                                                                                         | `PATCH /books/:id` (changed fields only)                                                                           |
| `/library/locations`                  | `GET /locations?page&limit`                                                                                                                                              | `POST /locations`, `PATCH /locations/:id` (no delete exists)                                                       |
| `/library/categories`, `/collections` | `GET /{kind}?page&limit`, `GET /categories/presets`                                                                                                                      | `POST /{kind}`                                                                                                     |
| `/library/{kind}/[id]`                | `GET /{kind}/:id`, `GET /{kind}/:id/books?page&limit`                                                                                                                    | `PATCH`/`DELETE /{kind}/:id`; `PUT`/`DELETE /{kind}/:id/books/:bookId`; picker `GET /api/library/books?q`          |
| `/library/wishlist`                   | `GET /wishlist?page&limit&status&priority&q&sort`                                                                                                                        | —                                                                                                                  |
| `/library/wishlist/new`               | —                                                                                                                                                                        | `POST /wishlist`                                                                                                   |
| `/library/wishlist/[id]`              | `GET /wishlist/:id`, `GET /books/:acquiredBookId` (if acquired)                                                                                                          | `PATCH`/`DELETE /wishlist/:id`; `PUT /wishlist/:id/acquisition`                                                    |

## Contract decisions

- **Book DTO only.** No `readingStatus`, `copyCount`, availability or loan state appear anywhere.
  Lending status comes in FE #19 from the loan-overview API.
- **Create omits blanks; PATCH sends only changes.** A blank optional field is omitted on create. On
  edit, a cleared field is sent as `null`, cleared authors as `[]`, and an unchanged form sends
  nothing ("No changes to save").
- **Duplicates are suggestions.** The duplicate check is debounced (600 ms), cancels the previous
  request, and never blocks saving.
- **Format conflicts are the API's call.** A 409 `BOOK_HAS_PHYSICAL_COPIES` is shown on the format
  field with "Keep it physical", and every other unsaved edit is kept. There is no client-side
  prediction.
- **Copies.** Physical books only (an ebook page explains why there are none). `locationId: null`
  means unassigned, offered as an explicit option. Unlabelled copies are named by the date they
  were added (UTC), never by list position, which changes as copies are added. Copy lists show the
  newest 100.
- **Locations** have no delete control, because the API has no delete endpoint. Selectors load
  every page (up to 50 × 100).
- **Groups.** Presets only fill in the name field; nothing is created until the reader saves.
  Membership order is the API's (order of first addition). There is no reorder UI, because there
  is no reorder endpoint. Deleting a group says plainly that its books are untouched.
- **Wishlist.** It never counts as owned. Acquisition links an existing catalogue book after an
  explicit, irreversible confirmation. A deleted linked book is resolved first and shown as no
  longer in the library, not as a broken link. Status and acquisition fields are never sent in a
  PATCH.
- **Search** is the API's whole-word, any-term search, and the UI says so. Filters live in the URL.
  Repeated or unknown parameters fall back to defaults on pages and are refused (400) on BFF
  routes, as the API would. A page past the end is a normal, empty result with a link back.
- **Forms keep early typing.** Every form uses uncontrolled fields (`defaultValue`) and reads its
  values from the form element (`readFormValues`). Text typed before the page became interactive
  (common on a slow phone) is never wiped by React re-rendering a controlled input. Browser tests
  hold back the JavaScript, type, then release it to prove this.
- **Reader text is text.** Titles, descriptions and notes render as React text, never HTML.
  Reader-supplied cover and source URLs are never fetched or shown as images (the CSP allows only
  this origin). They appear only as validated http(s) links with `rel="noopener noreferrer nofollow"`.
- **Errors.** 404 messages are an allowlist of the API's fixed resource messages (so another
  reader's record is indistinguishable from a missing one). Name conflicts keep the API's fixed
  sentence. Unknown 409s, 5xx, protocol and network failures become a generic 503. A 401 from the
  API ends the session and the client returns to sign-in, then back to the page.

## Not in FE #17

Reading sessions, notes, loans and lending status, dashboard statistics, exports, cover images,
ISBN lookup, unassigned-copy filtering (the API does not support it), location deletion, group
reordering and un-acquiring a wish (no API for any of these).
