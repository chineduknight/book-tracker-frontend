import type { Route } from 'next';
import Link from 'next/link';
import { InlineError } from '@/components/ui/inline-error';
import { ButtonLink } from '@/components/ui/button';
import { SectionHeader } from '@/components/ui/section-header';
import type { Page } from '@/lib/api/contract';
import { formatCalendarDate } from '@/lib/dates/calendar-date';
import type { Book } from '@/lib/library/types';
import { readingStateOf, type ReadingOverview, type ReadingSession } from '@/lib/reading/types';
import type { ReaderData } from '@/server/library/reader-data';
import {
  describeDates,
  describeProgress,
  ReadingStateBadge,
  ReadingStatusBadge,
  sessionName,
} from './reading-display';

/**
 * The book's reading state from the API's overview (never a field of the book), its most recent
 * readings, and the one action that fits: start, resume or reread.
 */
export function BookReadingSection({
  book,
  data,
}: {
  book: Book;
  data: ReaderData<{ overview: ReadingOverview; recent: Page<ReadingSession> }>;
}) {
  return (
    <section aria-labelledby="reading-heading" className="mb-10">
      <SectionHeader
        id="reading-heading"
        title="Reading"
        description="Each reading of this book is kept separately: starting again never overwrites an earlier read."
      />
      {data.status !== 'ok' ? (
        <InlineError title="Reading details couldn’t be loaded.">
          <p>The rest of this book is shown as usual. Reload the page to try again.</p>
        </InlineError>
      ) : (
        <ReadingDetails book={book} {...data.value} />
      )}
    </section>
  );
}

function ReadingDetails({
  book,
  overview,
  recent,
}: {
  book: Book;
  overview: ReadingOverview;
  recent: Page<ReadingSession>;
}) {
  const state = readingStateOf(overview);
  const lengths = { pageCount: book.pageCount, chapterCount: book.chapterCount };
  const active = overview.activeSession;
  const lastFinished = overview.lastCompletedSession;

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <ReadingStateBadge state={state} />
        <p className="text-sm text-ink">
          {active
            ? describeProgress(active.progress, lengths)
            : state === 'never-read'
              ? 'You haven’t recorded a reading of this book.'
              : lastFinished?.completedOn
                ? `Last finished ${formatCalendarDate(lastFinished.completedOn)}.`
                : 'Finished.'}
        </p>
      </div>
      <p className="text-sm text-ink-muted">
        {overview.totalSessions} {overview.totalSessions === 1 ? 'reading' : 'readings'} ·{' '}
        {overview.completedSessions} finished
      </p>
      <div className="flex flex-wrap gap-3">
        {active ? (
          <ButtonLink href={`/reading/${active.id}` as Route}>
            {state === 'rereading' ? 'Continue rereading' : 'Resume reading'}
          </ButtonLink>
        ) : (
          <ButtonLink href={`/reading/new?bookId=${book.id}` as Route}>
            {state === 'finished' ? 'Reread' : 'Start reading'}
          </ButtonLink>
        )}
        {active ? (
          <ButtonLink href={`/reading/new?bookId=${book.id}` as Route} variant="secondary">
            Record an earlier finished read
          </ButtonLink>
        ) : null}
      </div>
      {recent.items.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-ink">
            {recent.pagination.total > recent.items.length
              ? `The ${recent.items.length} most recent of ${recent.pagination.total} readings`
              : 'Readings'}
          </h3>
          <ul className="flex flex-col gap-2">
            {recent.items.map((session) => (
              <li
                key={session.id}
                className="flex flex-col gap-1 rounded-lg border border-line p-3 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/reading/${session.id}` as Route}
                    className="font-medium break-words text-accent hover:text-accent-hover"
                  >
                    {sessionName(session)}
                  </Link>
                  <ReadingStatusBadge
                    session={session}
                    isReread={session.status === 'in_progress' && overview.completedSessions > 0}
                  />
                </div>
                <span className="text-ink-muted">
                  {describeProgress(session.progress, lengths)} · {describeDates(session)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
