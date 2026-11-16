import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { BookOpen, SearchX } from 'lucide-react';
import { DataUnavailable } from '@/components/library/data-unavailable';
import { Notice } from '@/components/library/notice';
import { Pagination } from '@/components/library/pagination';
import {
  describeDates,
  describeProgress,
  RatingText,
  ReadingStatusBadge,
} from '@/components/reading/reading-display';
import { StartReadingPicker } from '@/components/reading/start-reading-picker';
import { authorLine } from '@/components/library/book-summary';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { SectionHeader } from '@/components/ui/section-header';
import { findDestination } from '@/config/navigation';
import { parseReadingHistoryQuery, readingHistoryHref } from '@/lib/reading/queries';
import { READING_SORT_LABELS, READING_SORTS } from '@/lib/reading/rules';
import { requireSignedInProfile } from '@/server/current-session';
import { loadAsReader } from '@/server/library/reader-data';
import { loadReadingHistory } from '@/server/reading/reading-pages';

export const metadata: Metadata = { title: 'Reading' };

const STATUS_FILTERS = [
  ['', 'All readings'],
  ['in_progress', 'In progress'],
  ['completed', 'Finished'],
] as const;

export default async function ReadingPage({ searchParams }: PageProps<'/reading'>) {
  await requireSignedInProfile();
  const params = await searchParams;
  const query = parseReadingHistoryQuery(params);
  const result = await loadAsReader((api) => loadReadingHistory(api, query));
  const { label, summary } = findDestination('/reading');
  const fieldClass =
    'min-h-11 rounded-lg border border-line-strong bg-surface px-3 text-base text-ink';

  return (
    <>
      <PageHeader title={label} description={summary} />
      <Notice notice={params.notice} />

      <section aria-labelledby="start-heading" className="mb-10">
        <SectionHeader
          id="start-heading"
          title="Start a reading"
          description="Choose one of your books to start reading it, or to record a read you’ve already finished. Each reading is kept separately, so rereads never overwrite earlier ones."
        />
        <Card>
          <StartReadingPicker collapsible />
        </Card>
      </section>

      <section aria-labelledby="history-heading">
        <SectionHeader id="history-heading" title="Reading history" />
        {result.status === 'ok' ? (
          <p className="mb-4 text-sm text-ink-muted">
            {result.value.totals.inProgress} in progress · {result.value.totals.completed} finished
          </p>
        ) : null}
        <form
          method="get"
          action="/reading"
          aria-label="Filter your reading history"
          className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-4"
        >
          <div className="flex min-w-0 flex-[1_1_10rem] flex-col gap-1.5">
            <label htmlFor="reading-status" className="text-sm font-medium text-ink">
              Show
            </label>
            <select
              id="reading-status"
              name="status"
              defaultValue={query.status ?? ''}
              className={fieldClass}
            >
              {STATUS_FILTERS.map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-0 flex-[1_1_10rem] flex-col gap-1.5">
            <label htmlFor="reading-sort" className="text-sm font-medium text-ink">
              Order
            </label>
            <select id="reading-sort" name="sort" defaultValue={query.sort} className={fieldClass}>
              {READING_SORTS.map((sort) => (
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
        </form>

        {result.status !== 'ok' ? (
          <DataUnavailable
            what="reading history"
            retryHref={readingHistoryHref(query)}
            retryAfterSeconds={
              result.status === 'unavailable' ? result.retryAfterSeconds : undefined
            }
          />
        ) : result.value.pagination.total === 0 ? (
          query.status ? (
            <EmptyState
              icon={SearchX}
              headingLevel="h3"
              title={
                query.status === 'in_progress' ? 'Nothing in progress' : 'No finished readings yet'
              }
              description="Other readings are under “All readings”."
              action={{ href: '/reading', label: 'Show all readings' }}
            />
          ) : (
            <EmptyState
              icon={BookOpen}
              headingLevel="h3"
              title="No readings yet"
              description="Choose a book to read above. Your progress, finished reads and rereads will appear here."
            />
          )
        ) : result.value.rows.length === 0 ? (
          <EmptyState
            icon={SearchX}
            headingLevel="h3"
            title="There are no readings on this page"
            description={`The history has ${result.value.pagination.totalPages} page(s).`}
            action={{ href: readingHistoryHref(query, 1) as Route, label: 'Go to the first page' }}
          />
        ) : (
          <>
            <ul className="flex flex-col gap-3">
              {result.value.rows.map(({ session, book, isReread }) => (
                <li
                  key={session.id}
                  className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      {book ? (
                        <>
                          <Link
                            href={`/reading/${session.id}` as Route}
                            className="font-serif text-lg font-semibold break-words text-ink hover:text-accent"
                          >
                            {book.title}
                          </Link>
                          <p className="text-sm break-words text-ink-muted">
                            {authorLine(book.authors)}
                          </p>
                        </>
                      ) : (
                        <p className="text-sm text-ink-muted">
                          This book is no longer in your library.
                        </p>
                      )}
                    </div>
                    <ReadingStatusBadge session={session} isReread={isReread} />
                  </div>
                  <p className="text-sm text-ink">
                    {describeProgress(session.progress, book ?? {})}
                  </p>
                  <p className="text-sm text-ink-muted">{describeDates(session)}</p>
                  <RatingText rating={session.rating} />
                  {book ? (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                      <Link
                        href={`/reading/${session.id}` as Route}
                        className="font-medium text-accent hover:text-accent-hover"
                        aria-label={`${session.status === 'in_progress' ? 'Update progress' : 'View reading'} of ${book.title}`}
                      >
                        {session.status === 'in_progress' ? 'Update progress' : 'View reading'}
                      </Link>
                      <Link
                        href={`/library/books/${book.id}` as Route}
                        className="font-medium text-accent hover:text-accent-hover"
                        aria-label={`Book details of ${book.title}`}
                      >
                        Book details
                      </Link>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
            <Pagination
              pagination={result.value.pagination}
              noun={result.value.pagination.total === 1 ? 'reading' : 'readings'}
              hrefFor={(page) => readingHistoryHref(query, page)}
            />
          </>
        )}
      </section>
    </>
  );
}
