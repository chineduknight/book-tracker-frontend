import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { NotebookPen, Plus, SearchX } from 'lucide-react';
import { DataUnavailable } from '@/components/library/data-unavailable';
import { Notice } from '@/components/library/notice';
import { Pagination } from '@/components/library/pagination';
import { NoteList } from '@/components/notes/note-list';
import { ButtonLink } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { findDestination } from '@/config/navigation';
import { isFilteredNotesQuery, notesHref, parseNotesQuery } from '@/lib/notes/queries';
import { NOTE_KIND_LABELS, NOTE_KINDS, NOTE_LIMITS } from '@/lib/notes/rules';
import { READING_SORT_LABELS } from '@/lib/reading/rules';
import { NOTE_SORTS } from '@/lib/notes/rules';
import { requireSignedInProfile } from '@/server/current-session';
import { loadAsReader } from '@/server/library/reader-data';
import { loadNotesPage } from '@/server/notes/note-pages';

export const metadata: Metadata = { title: 'Notes' };

export default async function NotesPage({ searchParams }: PageProps<'/notes'>) {
  await requireSignedInProfile();
  const params = await searchParams;
  const query = parseNotesQuery(params);
  const result = await loadAsReader((api) => loadNotesPage(api, query));
  const { label, summary } = findDestination('/notes');
  const isFiltered = isFilteredNotesQuery(query);
  const fieldClass =
    'min-h-11 rounded-lg border border-line-strong bg-surface px-3 text-base text-ink';
  const page = result.status === 'ok' && result.value.status === 'ok' ? result.value : null;
  const newNoteHref = query.bookId
    ? `/notes/new?bookId=${query.bookId}${query.readingSessionId ? `&readingSessionId=${query.readingSessionId}` : ''}`
    : '/notes/new';

  return (
    <>
      <PageHeader title={label} description={`${summary} Only you can see them.`} />
      <Notice notice={params.notice} />
      <div className="mb-6">
        <ButtonLink href={newNoteHref as Route}>
          <Plus aria-hidden="true" className="size-4" />
          New note or highlight
        </ButtonLink>
      </div>

      {query.bookId || query.readingSessionId ? (
        <p className="mb-4 flex flex-wrap items-center gap-2 text-sm text-ink">
          <span>
            {query.readingSessionId ? 'Showing notes from one reading' : 'Showing notes about'}
            {page?.filterBook ? (
              <>
                {query.readingSessionId ? ' of ' : ' '}
                <Link
                  href={`/library/books/${page.filterBook.id}` as Route}
                  className="font-medium text-accent hover:text-accent-hover"
                >
                  {page.filterBook.title}
                </Link>
              </>
            ) : query.readingSessionId ? null : (
              ' one book'
            )}
            .
          </span>
          <Link
            href={
              notesHref({
                kind: query.kind,
                q: query.q,
                chapter: query.chapter,
                sort: query.sort,
              }) as Route
            }
            className="font-medium text-accent hover:text-accent-hover"
          >
            Show notes for every book
          </Link>
        </p>
      ) : null}

      <form
        method="get"
        action="/notes"
        role="search"
        aria-label="Search and filter your notes"
        className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-4"
      >
        {query.bookId ? <input type="hidden" name="bookId" value={query.bookId} /> : null}
        {query.readingSessionId ? (
          <input type="hidden" name="readingSessionId" value={query.readingSessionId} />
        ) : null}
        <div className="flex min-w-0 flex-[1_1_16rem] flex-col gap-1.5">
          <label htmlFor="notes-q" className="text-sm font-medium text-ink">
            Search words
          </label>
          <input
            id="notes-q"
            name="q"
            type="search"
            maxLength={NOTE_LIMITS.search}
            defaultValue={query.q ?? ''}
            aria-describedby="notes-filter-hint"
            className={fieldClass}
          />
        </div>
        <div className="flex min-w-0 flex-[1_1_12rem] flex-col gap-1.5">
          <label htmlFor="notes-kind" className="text-sm font-medium text-ink">
            Kind
          </label>
          <select
            id="notes-kind"
            name="kind"
            defaultValue={query.kind ?? ''}
            className={fieldClass}
          >
            <option value="">Notes and highlights</option>
            {NOTE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {NOTE_KIND_LABELS[kind]}s only
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-0 flex-[1_1_11rem] flex-col gap-1.5">
          <label htmlFor="notes-chapter" className="text-sm font-medium text-ink">
            Chapter
          </label>
          <input
            id="notes-chapter"
            name="chapter"
            maxLength={NOTE_LIMITS.chapter}
            defaultValue={query.chapter ?? ''}
            aria-describedby="notes-filter-hint"
            className={fieldClass}
          />
        </div>
        <div className="flex min-w-0 flex-[1_1_9rem] flex-col gap-1.5">
          <label htmlFor="notes-sort" className="text-sm font-medium text-ink">
            Order
          </label>
          <select id="notes-sort" name="sort" defaultValue={query.sort} className={fieldClass}>
            {NOTE_SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {READING_SORT_LABELS[sort]}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="min-h-11 rounded-lg bg-accent px-4 text-sm font-medium text-on-accent hover:bg-accent-hover"
        >
          Apply
        </button>
        <p id="notes-filter-hint" className="basis-full text-xs text-ink-muted">
          Search finds notes containing any of the whole words, ignoring case and accents. Chapter
          matches the exact label, such as “Chapter 3”.
        </p>
      </form>

      {result.status !== 'ok' ? (
        <DataUnavailable
          what="notes"
          retryHref={notesHref(query)}
          retryAfterSeconds={result.status === 'unavailable' ? result.retryAfterSeconds : undefined}
        />
      ) : result.value.status === 'invalid-filter' ? (
        <EmptyState
          icon={SearchX}
          title="That book or reading isn’t available"
          description="It may have been deleted, or the link is wrong. Your other notes are unaffected."
          action={{ href: '/notes', label: 'Show all notes' }}
        />
      ) : !page ? null : page.pagination.total === 0 ? (
        isFiltered ? (
          <EmptyState
            icon={SearchX}
            title="No notes match"
            description="Search matches whole words only (“habit” doesn’t find “habits”), and chapter labels must match exactly. Try other words or fewer filters."
            action={{ href: '/notes', label: 'Clear filters' }}
          />
        ) : (
          <EmptyState
            icon={NotebookPen}
            title="No notes yet"
            description="Write down thoughts about a book or save a passage you want to keep. Notes are private to you."
            action={{ href: '/notes/new', label: 'Write your first note' }}
          />
        )
      ) : page.notes.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="There are no notes on this page"
          description={`The results have ${page.pagination.totalPages} page(s).`}
          action={{
            href: notesHref({ ...query, page: 1 }) as Route,
            label: 'Go to the first page',
          }}
        />
      ) : (
        <>
          <NoteList rows={page.notes} />
          <Pagination
            pagination={page.pagination}
            noun={page.pagination.total === 1 ? 'note' : 'notes'}
            hrefFor={(pageNumber) => notesHref({ ...query, page: pageNumber })}
          />
        </>
      )}
    </>
  );
}
