import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { Plus, Repeat, SearchX } from 'lucide-react';
import { LoanList } from '@/components/lending/loan-list';
import { DataUnavailable } from '@/components/library/data-unavailable';
import { Notice } from '@/components/library/notice';
import { Pagination } from '@/components/library/pagination';
import { ButtonLink } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { findDestination } from '@/config/navigation';
import { formatCalendarDate } from '@/lib/dates/calendar-date';
import { loanListHref, parseLoanListQuery } from '@/lib/lending/queries';
import {
  LOAN_SORT_LABELS,
  LOAN_SORTS,
  LOAN_STATUS_LABELS,
  LOAN_STATUSES,
  utcToday,
} from '@/lib/lending/rules';
import { cn } from '@/lib/utils';
import { requireSignedInProfile } from '@/server/current-session';
import { loadLoanLedger } from '@/server/lending/lending-pages';
import { loadAsReader } from '@/server/library/reader-data';

export const metadata: Metadata = { title: 'Lending' };

const EMPTY_FILTER = {
  active: ['Nothing is on loan', 'Every copy you lent has been returned.'],
  overdue: ['Nothing is overdue', 'No loan still out was due before the reference day.'],
  returned: ['No returned loans yet', 'Loans appear here once you mark them returned.'],
  all: ['No loans yet', ''],
} as const;

export default async function LendingPage({ searchParams }: PageProps<'/lending'>) {
  await requireSignedInProfile();
  const params = await searchParams;
  const query = parseLoanListQuery(params);
  const today = utcToday();
  // One explicit reference day for counts, rows and labels: the chosen one, or today in UTC (the
  // API's own default), so the page never mixes two definitions of "overdue".
  const asOf = query.status === 'overdue' && query.asOf ? query.asOf : today;
  const effective = { ...query, asOf: query.status === 'overdue' ? asOf : undefined };
  const result = await loadAsReader((api) => loadLoanLedger(api, effective, asOf));
  const { label, summary } = findDestination('/lending');
  const fieldClass =
    'min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-base text-ink';

  return (
    <>
      <PageHeader title={label} description={summary} />
      <Notice notice={params.notice} />
      <div className="mb-6">
        <ButtonLink href="/lending/new">
          <Plus aria-hidden="true" className="size-4" />
          Record a loan
        </ButtonLink>
      </div>

      <nav aria-label="Loan status" className="mb-4">
        <ul className="flex flex-wrap gap-2">
          {LOAN_STATUSES.map((status) => {
            const isCurrent = status === query.status;
            const count = result.status === 'ok' ? result.value.totals[status] : undefined;
            return (
              <li key={status}>
                <Link
                  href={loanListHref({ status, sort: query.sort, page: 1 }) as Route}
                  aria-current={isCurrent ? 'page' : undefined}
                  className={cn(
                    'inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium',
                    isCurrent
                      ? 'border-accent bg-accent-soft text-accent-ink'
                      : 'border-line-strong bg-surface text-ink hover:bg-surface-muted',
                  )}
                >
                  {LOAN_STATUS_LABELS[status]}
                  {count === undefined ? null : (
                    <span className="tabular-nums">
                      <span aria-hidden="true">{count}</span>
                      <span className="sr-only">
                        , {count} {count === 1 ? 'loan' : 'loans'}
                      </span>
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <form
        method="get"
        action="/lending"
        aria-label="Order and reference day"
        className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-4"
      >
        <input type="hidden" name="status" value={query.status} />
        <div className="flex min-w-0 flex-[1_1_11rem] flex-col gap-1.5">
          <label htmlFor="loan-sort" className="text-sm font-medium text-ink">
            Order
          </label>
          <select id="loan-sort" name="sort" defaultValue={query.sort} className={fieldClass}>
            {LOAN_SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {LOAN_SORT_LABELS[sort]}
              </option>
            ))}
          </select>
        </div>
        {query.status === 'overdue' ? (
          <div className="flex min-w-0 flex-[1_1_11rem] flex-col gap-1.5">
            <label htmlFor="loan-as-of" className="text-sm font-medium text-ink">
              Overdue as of
            </label>
            <input
              id="loan-as-of"
              name="asOf"
              type="date"
              defaultValue={asOf}
              aria-describedby="loan-as-of-hint"
              className={fieldClass}
            />
          </div>
        ) : null}
        <button
          type="submit"
          className="min-h-11 rounded-lg bg-accent px-4 text-sm font-medium text-on-accent hover:bg-accent-hover"
        >
          Apply
        </button>
        <p id="loan-as-of-hint" className="basis-full text-xs text-ink-muted">
          A loan is overdue when it is still out and its due day is before{' '}
          <strong className="font-semibold text-ink">{formatCalendarDate(asOf)}</strong>
          {asOf === today ? ' (today, as a UTC calendar day)' : ' (the day you chose)'}. Due on that
          day is not yet overdue; a loan without a due day never is.
        </p>
      </form>

      {result.status !== 'ok' ? (
        <DataUnavailable
          what="loans"
          retryHref={loanListHref(effective)}
          retryAfterSeconds={result.status === 'unavailable' ? result.retryAfterSeconds : undefined}
        />
      ) : result.value.totals.all === 0 ? (
        <EmptyState
          icon={Repeat}
          title="No loans yet"
          description="When you lend a physical copy, record it here: who has it, since when and when it’s due back."
          action={{ href: '/lending/new', label: 'Record a loan' }}
        />
      ) : result.value.pagination.total === 0 ? (
        <EmptyState
          icon={SearchX}
          title={EMPTY_FILTER[query.status][0]}
          description={EMPTY_FILTER[query.status][1]}
          action={{ href: '/lending?status=all', label: 'Show all loans' }}
        />
      ) : result.value.rows.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="There are no loans on this page"
          description={`The list has ${result.value.pagination.totalPages} page(s).`}
          action={{ href: loanListHref(effective, 1) as Route, label: 'Go to the first page' }}
        />
      ) : (
        <>
          <LoanList rows={result.value.rows} asOf={asOf} />
          <Pagination
            pagination={result.value.pagination}
            noun={result.value.pagination.total === 1 ? 'loan' : 'loans'}
            hrefFor={(page) => loanListHref(effective, page)}
          />
        </>
      )}
    </>
  );
}
