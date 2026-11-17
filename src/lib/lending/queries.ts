import { isCalendarDate } from '@/lib/dates/calendar-date';
import { hrefWithQuery, parsePage, type SearchParams } from '@/lib/library/queries';
import { LOAN_SORTS, LOAN_STATUSES, type LoanSort, type LoanStatusFilter } from './rules';

/**
 * Loan list filters in the URL, exactly the API's: status (active by default), order by when the
 * loan was recorded, page, and `asOf`, which the API accepts only with `status=overdue`.
 */
export interface LoanListQuery {
  status: LoanStatusFilter;
  sort: LoanSort;
  page: number;
  asOf?: string | undefined;
}

/**
 * A parsed address. `rejectedAsOf` is set when the overdue view was asked for a reference day that
 * is not one valid calendar day (malformed, impossible such as 2027-02-29, empty, or repeated): the
 * page must say so rather than quietly listing loans as of a different day.
 */
export interface ParsedLoanListQuery extends LoanListQuery {
  rejectedAsOf?: string | undefined;
}

export const LOAN_QUERY_DEFAULTS = { status: 'active', sort: 'recent', page: 1 } as const;

function single(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  return typeof value === 'string' ? value : undefined;
}

export function parseLoanListQuery(params: SearchParams): ParsedLoanListQuery {
  const status =
    LOAN_STATUSES.find((candidate) => candidate === single(params, 'status')) ?? 'active';
  const query: ParsedLoanListQuery = {
    status,
    sort: LOAN_SORTS.find((candidate) => candidate === single(params, 'sort')) ?? 'recent',
    page: parsePage(params),
    asOf: undefined,
  };
  // The API accepts a reference day only for the overdue view; elsewhere it is not part of the
  // address and is ignored, like any other parameter that does not apply.
  const raw = params.asOf;
  if (status !== 'overdue' || raw === undefined) return query;
  if (typeof raw === 'string' && isCalendarDate(raw)) return { ...query, asOf: raw };
  return { ...query, rejectedAsOf: typeof raw === 'string' ? raw : raw.join(', ') };
}

export function loanListHref(query: LoanListQuery, page = query.page): string {
  return hrefWithQuery(
    '/lending',
    {
      status: query.status,
      sort: query.sort,
      asOf: query.status === 'overdue' ? query.asOf : undefined,
      page,
    },
    LOAN_QUERY_DEFAULTS,
  );
}
