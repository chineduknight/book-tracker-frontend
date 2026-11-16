# Reading and notes: routes, API endpoints and contract decisions

FE #18. Reading sessions, progress, completion, rereads, notes and highlights. It uses the same
server-side BFF as the Library ([library-contract.md](library-contract.md)): the browser never calls
the Book Tracker API and never holds a token. Contract source: `book-tracker-backend` `main` at
`fea9c12` (`docs/api-contract.md`, `src/modules/reading`, `src/modules/notes`). CI tests against
that exact commit.

## How data flows

- **Pages** read through `loadAsReader` → `sessions.callAsReader` → one function per endpoint in
  `src/server/reading/reading-api.ts` and `src/server/notes/note-api.ts`. Every response passes the
  DTO schemas in `reading-schemas.ts` and `note-schemas.ts`. Each page performs its own session check.
- **Writes and pickers** call explicit routes under `/api/reading/*` and `/api/notes/*`. Each binds
  one operation and goes through the FE #17 pipeline (`library-route.ts`): exact-Origin and
  `Sec-Fetch-Site` check → 24-hex ids → a strict JSON body or a strict query allowlist → the
  reader's session → exactly one API call → sanitized errors → `no-store`.
- **Book page** (`/library/books/[id]`) loads its Reading section (overview + 5 newest readings)
  and its Notes section (3 newest + total) separately from the book. If either is down, only that
  section shows an error: a healthy book is never turned into a 404 or an empty record.

## Route matrix

| Page / route                         | Reads (API)                                                                                                                                                                                                                           | Writes (BFF → API)                                                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `/reading`                           | `GET /reading-sessions?page&limit&status&sort`; two `limit=1` calls for the in-progress and finished totals; `GET /books/:id` per distinct book on the page; `GET /books/:id/reading-overview` per in-progress row (to label rereads) | —                                                                                                                                             |
| `/reading/new?bookId`                | `GET /books/:id`, `GET /books/:id/reading-overview`                                                                                                                                                                                   | `POST /api/reading/books/:bookId/sessions` → `POST /books/:bookId/reading-sessions`; on a conflict, `GET /api/reading/books/:bookId/overview` |
| `/reading/[sessionId]`               | `GET /reading-sessions/:id`, `GET /books/:bookId`, `GET /books/:bookId/reading-overview`, `GET /notes?bookId&readingSessionId&limit=5`                                                                                                | `PATCH /api/reading/sessions/:id` → `PATCH /reading-sessions/:id` (no delete exists)                                                          |
| `/notes`                             | `GET /notes?page&limit&sort&kind&q&chapter&bookId&readingSessionId`; `GET /books/:id` per distinct book on the page                                                                                                                   | —                                                                                                                                             |
| `/notes/new?bookId&readingSessionId` | `GET /books/:id`, `GET /books/:id/reading-sessions?page=1&limit=20` (+ the linked session if older)                                                                                                                                   | `POST /api/notes/books/:bookId` → `POST /books/:bookId/notes`; picker pages: `GET /api/reading/books/:bookId/sessions?page`                   |
| `/notes/[noteId]`                    | `GET /notes/:id`, `GET /books/:bookId`, `GET /reading-sessions/:id` (if linked)                                                                                                                                                       | `DELETE /api/notes/:id` → `DELETE /notes/:id` (soft, 204)                                                                                     |
| `/notes/[noteId]/edit`               | `GET /notes/:id`, `GET /books/:bookId`                                                                                                                                                                                                | `PATCH /api/notes/:id` → `PATCH /notes/:id`                                                                                                   |
| `/library/books/[id]` (sections)     | `GET /books/:id/reading-overview`, `GET /books/:id/reading-sessions?limit=5`, `GET /books/:id/notes?limit=3`                                                                                                                          | —                                                                                                                                             |

Fan-out is bounded: at most one book request per distinct book on a page of 20 (four at a time),
plus at most one overview per in-progress row. A book deleted between the two requests is labelled
as such. Any other failure makes the page "unavailable", never a shorter list.

## Reading semantics

- **A reading belongs to a catalogue book**, never to a physical copy. Books have no reading
  status. The book's state (not read yet / reading now / rereading / read) is derived from the
  overview: "rereading" means an in-progress reading after at least one finished one.
- **Start** sends an empty body (`in_progress` is the API default). **Record a finished read** sends
  `status: "completed"` plus whatever was entered. No date is ever filled in, on create or on finish.
- **One reading in progress per book.** If the reader (or another device) already has one, the
  start option is disabled. A late `409 READING_SESSION_IN_PROGRESS` fetches the overview and links
  to the existing reading; nothing is duplicated.
- **Edits send only changed fields.** A no-op sends no request. `null` clears progress, dates, rating
  or summary. Progress is one `{ unit, value }` object. **Finishing** is a separate, confirmed step
  that sends `status: "completed"` (with a finish date only if given) together with any other edits
  on the page. `status` is never sent as `in_progress`: a finished reading cannot be reopened, and
  rereading starts a new reading. Reaching the last page or 100% never finishes anything.
- **Progress may go down.** The API allows it, so no "only forwards" rule is invented. A known
  `pageCount` or `chapterCount` caps the value in the form, with the maximum explained; the API stays
  authoritative.
- **Calendar days** are `YYYY-MM-DD` strings from native date inputs. They are validated as real days
  (leap years included), and the finish date must be on or after the start date. They are displayed
  straight from the text (`29 Feb 2028`), never through a local `Date`, so no time zone can shift
  them. "Recorded" and "Added" dates are the UTC day of the API timestamp.
- **Conflicts**: `READING_SESSION_UPDATE_CONFLICT` keeps every field and asks the reader to save again.
  `INVALID_READING_TRANSITION` is mapped but cannot be produced by this UI.

## Notes semantics

- `kind` is chosen once on create (radio, required) and never sent on PATCH. Neither is
  `readingSessionId`: the link to a reading is chosen on create (any reading **of the chosen book**,
  paged with "Load more readings", or none), the form says it is permanent, and a mismatch (`409
READING_SESSION_BOOK_MISMATCH`) is shown on the reading field.
- The book can be chosen or changed on the form without losing typed text; changing it only clears
  the reading link. Notes are created from `/notes`, from a book, or from a reading (preselected).
- Text is trimmed at the ends only, exactly as the API trims; line breaks, spacing and punctuation
  are kept. PATCH sends changed fields, `null` clears title, commentary, chapter or page, and content
  can never be cleared. Limits mirror the API: note 20,000 characters, highlight 5,000, commentary
  5,000, title 160, chapter 200, page 1–100,000. The textarea has no `maxLength`, so a long paste is
  never silently cut; a live counter and validation say when it is too long.
- **Search** offers only what the API supports: `q` (whole words, any word, case- and
  accent-insensitive; no prefixes), `kind`, exact `chapter`, `sort`, plus `bookId` and
  `readingSessionId` from links. Changing a filter returns to page 1. A malformed id, or a book or
  reading the reader can't see (404, or 409 for a reading of another book), shows "That book or
  reading isn't available", never "no notes".
- **Delete** is soft (the API keeps the record) and needs explicit confirmation. There is no
  restore or permanent delete.
- Distinct states: no notes yet, no matches, a page past the end, unavailable, and not found.

## Safe presentation of Markdown and quotations

No Markdown renderer is used. Note content and commentary are shown as their **source text** in a
monospaced, line-preserving block labelled "Written in Markdown · shown as plain text". Highlights
are shown as a literal `<blockquote>`. Every value is a React text node: there is no
`dangerouslySetInnerHTML`, no HTML parsing, no links or images created from note text, no previews
and no remote loads. `<script>`, `<img onerror>`, `javascript:` links and tracking images appear as
the characters typed. This avoids a new dependency and its XSS, link-protocol and tracker
configuration surface. A carefully configured renderer can be considered later as a product
decision.

## Request size

The API accepts JSON bodies up to 100 kB (Express `100kb` = 102,400 bytes). Note writes use that same
cap (`MAX_NOTE_REQUEST_BYTES`). A maximal 20,000-character note fits even in 3-byte characters.
Library writes keep 32 KiB and authentication keeps 8 KiB. The cap is enforced:

1. in the form, before sending (the JSON's UTF-8 size), with a clear message and nothing sent;
2. on the streamed request bytes in the BFF (whatever `Content-Length` claims);
3. on the re-serialised body the BFF forwards; and the API's own `413` maps to the same friendly
   error.

Text made mostly of control characters (each escaped as 6 bytes) can still exceed 100 kB, as the API
documents.

## Errors and privacy

- New allowlisted 404 messages: "Reading session not found", "Note not found". Missing, deleted and
  other readers' records are indistinguishable. New fixed 409 messages for the four reading and
  notes conflict codes. Upstream text is never shown.
- 401 ends the session (sign-in with a return path for `/reading/[id]` and `/notes/[id]`). 429
  carries its wait. An outage is an error view. 503 is never an empty result.
- A create whose outcome is unknown (no response, or the API unreachable mid-request) says so,
  keeps the text, links to where to check, and is never retried automatically. Edits (idempotent)
  say saving again is safe.
- Note text, summaries and search terms are not logged by the BFF. Search words and chapter labels
  are in the `/notes` URL (they are filters, like Library search). Note content never is.

## Unsaved work

Note create and edit forms, and the reading forms, warn before unsaved text is lost: in-app links
(including the navigation bar and Cancel) open a "Discard unsaved changes?" dialog, and reload or
close triggers the browser's prompt. Dirtiness is read from the fields themselves, so text typed
before hydration counts. There is no autosave and no draft storage.

## Known limitations

- Browser back/forward inside the app is not intercepted by the unsaved-changes warning.
- The book page shows the 5 newest readings of a book; the full per-book history is not paged in
  the UI yet (the global `/reading` history is fully paged).
- The reading history labels a reread only on in-progress rows (it costs one overview per row).
- Markdown is not rendered (see above).
