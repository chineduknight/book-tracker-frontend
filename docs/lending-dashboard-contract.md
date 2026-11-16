# Lending and Home dashboard: routes, API endpoints and contract decisions

FE #19. A personal lending ledger for physical copies, and a read-only Home overview computed by the
API. Same server-side BFF as the Library, Reading and Notes ([library-contract.md](library-contract.md),
[reading-notes-contract.md](reading-notes-contract.md)): the browser never calls the Book Tracker API
and never holds a token. Contract source: `book-tracker-backend` `main` at `fea9c12`
(`docs/api-contract.md` sections Loans and Dashboard, `src/modules/loans`, `src/modules/dashboard`).
CI tests against that exact commit.

## How data flows

- **Pages** read on the server through `loadAsReader` → `sessions.callAsReader` → one function per
  endpoint in `src/server/lending/lending-api.ts` and `src/server/dashboard/dashboard-api.ts`. Every
  response passes a DTO schema (`lending-schemas.ts`, `dashboard-schemas.ts`); the dashboard summary
  schema also checks the API's documented invariants.
- **The browser** only writes and checks one copy, through four allowlisted routes on the FE #17
  pipeline (`library-route.ts`): exact `Origin` and `Sec-Fetch-Site`, 24-hex ids, strict JSON bodies
  (32 KiB), the reader's session, exactly one API call, sanitized errors, `no-store`. There are no
  browser dashboard routes: nothing on Home needs a client fetch.

| Browser route (BFF)                         | API                                 |
| ------------------------------------------- | ----------------------------------- |
| `POST /api/lending/copies/[copyId]/loans`   | `POST /copies/:copyId/loans`        |
| `GET /api/lending/copies/[copyId]/overview` | `GET /copies/:copyId/loan-overview` |
| `PATCH /api/lending/loans/[loanId]`         | `PATCH /loans/:loanId`              |
| `PUT /api/lending/loans/[loanId]/return`    | `PUT /loans/:loanId/return`         |

## Pages

| Page                               | Reads (API)                                                                                                                                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/lending`                         | `GET /loans?page&limit=20&status&sort[&asOf]`; four `limit=1` calls for the Active, Overdue, Returned and All totals; `GET /books/:id` and `GET /copies/:id` once per distinct record on the page (four at a time) |
| `/lending/new`                     | Step 1: book picker (`/api/library/books`). Step 2 `?bookId`: `GET /books/:id`, `GET /books/:id/copies?page&limit=20`. Step 3 `?copyId`: `GET /copies/:id`, `GET /books/:id`, `GET /copies/:id/loan-overview`      |
| `/lending/[loanId]`                | `GET /loans/:id`; `GET /books/:bookId` and `GET /copies/:copyId` (404 means "no longer available"); for a returned loan, the copy's overview, to offer a new loan only when it is free                             |
| `/lending/copies/[copyId]`         | `GET /copies/:id`, `GET /books/:bookId`, `GET /copies/:id/loan-overview`, `GET /copies/:id/loans?status=all&page`                                                                                                  |
| `/library/books/[bookId]` (copies) | Per copy, on request only: `GET /api/lending/copies/[copyId]/overview`                                                                                                                                             |
| `/` (Home)                         | `GET /dashboard/summary`, `GET /dashboard/reading-statistics`, `GET /dashboard/recent-activity?limit=10`, plus one `GET /books/:id` per distinct book and one `GET /wishlist/:id` per wish in the feed             |

## Loans

- **One loan is one lending event of one physical copy.** Choosing a copy (not just a title) is part of
  the flow: book → its copies, paged and named by the FE #17 stable reference → the form. Ebooks have
  no copies, so there is nothing to lend.
- **Explicit days only.** `lentOn` is required and never prefilled; `dueOn` is optional; the return day
  is chosen in a confirmation dialog. Future days are accepted, as by the API. Days are compared and
  displayed as text, never through a local `Date`.
- **Create** omits blank optional fields and never sends `returnedOn`. A copy that is already out is
  refused by the API with `409 COPY_ALREADY_ON_LOAN`; the form keeps the text and links to the current
  loan. Creating is not idempotent, so a request with an unknown outcome is never retried: the form
  says it could not confirm the save and links to the copy's loans to check first.
- **Edit** sends only changed fields (`null` clears contact, due day or note); a no-op sends nothing.
  `returnedOn` is sent only to correct a loan that is already returned, never as `null`.
  `409 LOAN_UPDATE_CONFLICT` keeps every field.
- **Return** is a separate, confirmed `PUT` with exactly `{ returnedOn }`. The same day again is an
  idempotent `200`; a different day after a return elsewhere is `409 LOAN_ALREADY_RETURNED`, which
  says to correct the date by editing. Cancel or Escape clears only the pending return day and resyncs
  the unsaved-changes guard; other unsaved edits keep their warning. Because recording a return reloads
  the loan, the dialog holds the return while other edits are unsaved, instead of silently dropping
  them.
- **There is no delete, reopen, renewal or borrower directory**, and none is offered. A returned loan
  offers "Record a new loan of this copy" only when the copy still exists and its overview says it is
  free (an unknown overview offers nothing).
- **Deleted copies and books.** A loan stays listed, readable, editable and returnable. Pages say
  "Book no longer in your library" or "Copy #abc123 no longer available" instead of linking to a
  missing record. Only a `404` means "no longer available"; any other failure is an outage. The book
  and copy delete confirmations say that loans stay in Lending.

### Status and overdue

- Filters: Active (default), Overdue, Returned, All, each with its total from the API; order by when
  the loan was recorded (newest or oldest), never by its days.
- **Overdue** is the API's definition: still out, with a due day strictly before the reference day.
  Due on that day is not overdue; no due day never is; returned never is.
- Every page states its reference day. The ledger passes one explicit `asOf` to every request (the
  chosen day on the Overdue view, else today as a UTC calendar day, the API's own default), so counts,
  rows and labels agree. The Overdue view has a date control for `asOf`, kept across pages.
- State is words, never colour alone: "On loan", "Returned", "Overdue" (with ", due 12 Mar 2026" for
  screen readers).

### Copy integration

- Each copy on a book page has **Check loan status** (one request, only when asked, so a book with
  many copies never fans out), **Loan history** (`/lending/copies/[copyId]`, paged by the API) and,
  when free, **Lend this copy**. A failed check says it could not check; it is never "available".

## Home dashboard

- **Every number comes from the API.** Nothing is counted from a list, stored or derived on the
  client. The tiles show books (physical and ebooks), physical copies, reading now, books ever
  finished, notes and highlights, wanted wishes, active and overdue loans.
- **Semantics kept intact:** a book being reread is "reading now" and also "ever finished", not
  "finished"; sessions are readings, not books; loans of deleted books still count; the summary's
  `asOf` applies to overdue loans only and is shown.
- **Attention:** overdue loans link to `/lending?status=overdue&asOf=<the summary's day>`. "No loans are
  overdue" is said only when the summary loaded. There is no "due soon" (no API support).
- **Reading by format:** two tables (books and readings) for all, physical and ebook. No percentages,
  trends, streaks or averages.
- **Recently recorded:** the API's newest 10 creation events, in its order, labelled as what they are
  ("Book added", "Reading recorded", "Note added", "Highlight added", "Wish added", "Loan recorded").
  There are no events for edits, returns, completions or deletions, and none is claimed. Subjects are
  book or wish titles, resolved in a bounded number of requests; never borrowers, contacts or note
  text. A record whose book is gone gets a neutral label; a loan stays linked, because loans outlive
  their books. Days are UTC calendar days of when each was recorded.
- **Resilience:** the summary, the statistics and the feed load independently. A failed section shows
  "couldn't be loaded" and Try again; it never becomes zeroes or blanks the others.

## Privacy

Borrower names and contacts are shown only on signed-in Lending pages and the book page's on-demand
copy status. They never appear in URLs, page titles, the Home feed, logs or error messages; API error
text is replaced by fixed messages. Query strings and bodies are not logged by the BFF.

## Known limitations and deferred items

- The browser back/forward buttons are not intercepted by the unsaved-changes warning (as in FE #18).
- `/lending` shows each loan's book and copy only while they exist; there is no search by borrower
  (the API has none).
- At 320 px with 200% text, the shared header's avatar overlaps the wordmark and bottom-bar labels
  wrap mid-word (FE #15 shell, unchanged here; there is no sideways scrolling). Left for FE #20 polish.
- Reminders, notifications, renewals, fines, holds, ebook loans and exports remain out of scope.
