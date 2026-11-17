import type { Route } from 'next';
import Link from 'next/link';
import { BookOpen, Heart, NotebookPen, Plus, Repeat, TriangleAlert } from 'lucide-react';
import { InlineError } from '@/components/ui/inline-error';
import { SectionHeader } from '@/components/ui/section-header';
import { formatCalendarDate, formatTimestampDay } from '@/lib/dates/calendar-date';
import {
  ACTIVITY_LABELS,
  type DashboardSummary,
  type ReadingCounts,
  type ReadingStatistics,
} from '@/lib/dashboard/types';
import type { ReaderData } from '@/server/library/reader-data';
import type { ActivityItem } from '@/server/dashboard/dashboard-pages';

const linkClass = 'font-medium text-accent hover:text-accent-hover';

function SectionUnavailable({ what }: { what: string }) {
  return (
    <div className="flex flex-col gap-3">
      <InlineError title={`${what} couldn’t be loaded.`}>
        <p>The rest of Home is shown as usual. Nothing has been lost.</p>
      </InlineError>
      <Link
        href="/"
        className="inline-flex min-h-11 w-fit items-center rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-muted"
      >
        Try again
      </Link>
    </div>
  );
}

const QUICK_ACTIONS = [
  { href: '/library/new', label: 'Add a book', icon: Plus },
  { href: '/reading', label: 'Start or continue reading', icon: BookOpen },
  { href: '/notes/new', label: 'New note', icon: NotebookPen },
  { href: '/lending/new', label: 'Record a loan', icon: Repeat },
  { href: '/library/wishlist', label: 'Open the wishlist', icon: Heart },
] as const;

export function QuickActions() {
  return (
    <nav aria-label="Quick actions" className="mb-10">
      <ul className="flex flex-wrap gap-2">
        {QUICK_ACTIONS.map(({ href, label, icon: Icon }) => (
          <li key={href} className="min-w-0 max-w-full">
            <Link
              href={href as Route}
              className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-muted"
            >
              <Icon aria-hidden="true" className="size-4 shrink-0 text-accent" />
              <span className="min-w-0 wrap-anywhere">{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * A count that links to where it comes from. When the destination lists something other than what
 * is counted (readings rather than books, books rather than copies), `destination` says so in the
 * link itself, so the number and the page it opens never appear to disagree.
 */
function Tile({
  label,
  value,
  detail,
  destination,
  href,
}: {
  label: string;
  value: number;
  detail?: string | undefined;
  destination?: string | undefined;
  href: string;
}) {
  return (
    <li className="min-w-0">
      <Link
        href={href as Route}
        className="flex h-full min-h-11 flex-col gap-1 rounded-xl border border-line bg-surface p-4 hover:border-line-strong"
      >
        {/* The spaces between parts keep the link's accessible name readable ("… finished 2 Each
            book …"); between flex items they take no room. */}
        <span className="text-sm wrap-anywhere text-ink-muted">{label}</span>{' '}
        <span className="font-serif text-3xl font-semibold text-ink tabular-nums">
          {value.toLocaleString('en')}
        </span>{' '}
        {detail ? <span className="text-xs wrap-anywhere text-ink-muted">{detail}</span> : null}{' '}
        {destination ? (
          <span className="mt-auto pt-1 text-xs font-medium wrap-anywhere text-accent">
            {destination}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

/** The API's own counts. Nothing here is derived from a list that happened to load. */
export function AtAGlance({ data }: { data: ReaderData<DashboardSummary> }) {
  return (
    <section aria-labelledby="glance-heading" className="mb-10">
      <SectionHeader id="glance-heading" title="At a glance" />
      {data.status !== 'ok' ? (
        <SectionUnavailable what="Your library’s numbers" />
      ) : (
        <GlanceTiles summary={data.value} />
      )}
    </section>
  );
}

function plural(count: number, one: string, many: string) {
  return `${count.toLocaleString('en')} ${count === 1 ? one : many}`;
}

function GlanceTiles({ summary }: { summary: DashboardSummary }) {
  const { catalogue, reading, notes, wishlist, lending } = summary;
  return (
    <>
      {catalogue.totalBooks === 0 ? (
        <p className="mb-4 max-w-prose text-sm text-ink">
          Your library is empty so far.{' '}
          <Link href="/library/new" className={linkClass}>
            Add your first book
          </Link>{' '}
          to start tracking reading, notes and loans.
        </p>
      ) : null}
      <ul className="grid grid-cols-1 gap-3 @xs:grid-cols-2 @2xl:grid-cols-4">
        <Tile
          label="Books"
          value={catalogue.totalBooks}
          detail={`${plural(catalogue.physicalBooks, 'physical', 'physical')} · ${plural(catalogue.ebooks, 'ebook', 'ebooks')}`}
          href="/library"
        />
        <Tile
          label="Physical copies"
          value={catalogue.physicalCopies}
          destination="Opens your physical books, each with its copies"
          href="/library?format=physical"
        />
        <Tile
          label="Reading now"
          value={reading.currentlyReadingBooks}
          detail="Books with a reading in progress, rereads included"
          href="/reading?status=in_progress"
        />
        <Tile
          label="Books ever finished"
          value={reading.booksEverCompleted}
          detail="Each book counted once, even if reread now"
          destination="Opens finished readings, where each reread is listed"
          href="/reading?status=completed"
        />
        <Tile
          label="Notes and highlights"
          value={notes.notes + notes.highlights}
          detail={`${plural(notes.notes, 'note', 'notes')} · ${plural(notes.highlights, 'highlight', 'highlights')}`}
          href="/notes"
        />
        <Tile
          label="On the wishlist"
          value={wishlist.wanted}
          detail="Still wanted"
          href="/library/wishlist"
        />
        <Tile label="Active loans" value={lending.activeLoans} href="/lending" />
        <Tile
          label="Overdue loans"
          value={lending.overdueLoans}
          detail={`As of ${formatCalendarDate(summary.asOf)} (UTC)`}
          href={`/lending?status=overdue&asOf=${summary.asOf}`}
        />
      </ul>
    </>
  );
}

/** Only claims "nothing overdue" when the summary actually loaded. */
export function Attention({ data }: { data: ReaderData<DashboardSummary> }) {
  if (data.status !== 'ok') return null;
  const { lending, asOf } = data.value;
  if (lending.overdueLoans === 0) {
    return (
      <p className="mb-10 text-sm text-ink-muted">
        No loans are overdue as of {formatCalendarDate(asOf)} (today, as a UTC calendar day).
      </p>
    );
  }
  return (
    <section
      aria-labelledby="attention-heading"
      className="mb-10 flex flex-col gap-2 rounded-xl border border-danger bg-surface p-4"
    >
      <h2
        id="attention-heading"
        className="flex items-center gap-2 font-serif text-lg font-semibold text-ink"
      >
        <TriangleAlert aria-hidden="true" className="size-5 shrink-0 text-danger" />
        Needs attention
      </h2>
      <p className="text-sm text-ink">
        {plural(lending.overdueLoans, 'loan is', 'loans are')} overdue: still out after the due day,
        as of {formatCalendarDate(asOf)} (UTC).
      </p>
      <Link
        href={`/lending?status=overdue&asOf=${asOf}` as Route}
        className={`${linkClass} w-fit text-sm`}
      >
        Review overdue loans
      </Link>
    </section>
  );
}

const BOOK_ROWS: Array<[keyof ReadingCounts['books'], string]> = [
  ['total', 'Books'],
  ['unread', 'Not read yet'],
  ['reading', 'Reading now'],
  ['completed', 'Finished (not being reread)'],
  ['everCompleted', 'Ever finished'],
];
const SESSION_ROWS: Array<[keyof ReadingCounts['sessions'], string]> = [
  ['total', 'Readings recorded'],
  ['inProgress', 'In progress'],
  ['completed', 'Finished'],
  ['rereads', 'Rereads (after a book’s first reading)'],
];

function BreakdownTable<Key extends string>({
  caption,
  rows,
  pick,
  statistics,
}: {
  caption: string;
  rows: Array<[Key, string]>;
  pick: (counts: ReadingCounts) => Record<Key, number>;
  statistics: ReadingStatistics;
}) {
  const columns = [
    ['All', statistics.overall],
    ['Physical', statistics.byFormat.physical],
    ['Ebook', statistics.byFormat.ebook],
  ] as const;
  return (
    <table className="w-full table-fixed border-collapse text-sm">
      <caption className="mb-2 text-left font-semibold text-ink">{caption}</caption>
      <thead>
        <tr className="border-b border-line text-left text-ink-muted">
          <th scope="col" className="w-2/5 py-2 pr-2 font-medium">
            <span className="sr-only">Measure</span>
          </th>
          {columns.map(([label]) => (
            <th key={label} scope="col" className="py-2 pr-2 text-right font-medium">
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(([key, label]) => (
          <tr key={key} className="border-b border-line last:border-0">
            <th scope="row" className="py-2 pr-2 text-left font-normal wrap-anywhere text-ink">
              {label}
            </th>
            {columns.map(([column, counts]) => (
              <td key={column} className="py-2 pr-2 text-right text-ink tabular-nums">
                {pick(counts)[key].toLocaleString('en')}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Counts by format, as text: no invented trends, streaks or averages. */
export function ReadingBreakdown({ data }: { data: ReaderData<ReadingStatistics> }) {
  return (
    <section aria-labelledby="breakdown-heading" className="mb-10">
      <SectionHeader
        id="breakdown-heading"
        title="Reading by format"
        description="A book being reread counts as “reading now” and also as “ever finished”."
      />
      {data.status !== 'ok' ? (
        <SectionUnavailable what="Reading statistics" />
      ) : data.value.overall.books.total === 0 ? (
        <p className="text-sm text-ink-muted">
          No books yet, so nothing to break down.{' '}
          <Link href="/library/new" className={linkClass}>
            Add a book
          </Link>
        </p>
      ) : (
        <div className="flex flex-col gap-6 rounded-xl border border-line bg-surface p-4">
          <BreakdownTable
            caption="Books"
            rows={BOOK_ROWS}
            pick={(c) => c.books}
            statistics={data.value}
          />
          <BreakdownTable
            caption="Readings"
            rows={SESSION_ROWS}
            pick={(c) => c.sessions}
            statistics={data.value}
          />
          <Link href="/reading" className={`${linkClass} w-fit text-sm`}>
            Open your reading history
          </Link>
        </div>
      )}
    </section>
  );
}

function activityText(item: ActivityItem): string {
  if (item.activity.type === 'wishlist_item_added')
    return item.subject ?? 'A wish no longer on your list';
  if (item.subject) return item.subject;
  return item.bookGone ? 'A book no longer in your library' : 'A record no longer available';
}

/**
 * Newly recorded things only, in the API's order. Edits, returns, completions and deletions have no
 * events, so none is ever claimed. Borrowers and note text are never shown here.
 */
export function RecentActivity({ data }: { data: ReaderData<ActivityItem[]> }) {
  return (
    <section aria-labelledby="activity-heading" className="mb-10">
      <SectionHeader
        id="activity-heading"
        title="Recently recorded"
        description="The newest things you added. Days are UTC calendar days of when each was recorded."
      />
      {data.status !== 'ok' ? (
        <SectionUnavailable what="Recent activity" />
      ) : data.value.length === 0 ? (
        <p className="text-sm text-ink-muted">Nothing recorded yet.</p>
      ) : (
        <ol className="flex flex-col divide-y divide-line rounded-xl border border-line bg-surface">
          {data.value.map((item) => (
            <li
              key={`${item.activity.type}-${item.activity.resourceId}`}
              className="flex flex-col gap-0.5 px-4 py-3 text-sm @md:flex-row @md:items-baseline @md:justify-between @md:gap-4"
            >
              <span className="min-w-0 wrap-anywhere">
                <span className="font-medium text-ink">{ACTIVITY_LABELS[item.activity.type]}</span>
                {' · '}
                {item.href ? (
                  <Link href={item.href as Route} className={linkClass}>
                    {activityText(item)}
                  </Link>
                ) : (
                  <span className="text-ink-muted">{activityText(item)}</span>
                )}
              </span>
              <time dateTime={item.activity.occurredAt} className="shrink-0 text-xs text-ink-muted">
                {formatTimestampDay(item.activity.occurredAt)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
