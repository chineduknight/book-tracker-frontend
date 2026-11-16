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

export const LOAN_QUERY_DEFAULTS = { status: 'active', sort: 'recent', page: 1 } as const;

function single(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  return typeof value === 'string' ? value : undefined;
}

export function parseLoanListQuery(params: SearchParams): LoanListQuery {
  const status =
    LOAN_STATUSES.find((candidate) => candidate === single(params, 'status')) ?? 'active';
  const asOf = single(params, 'asOf');
  return {
    status,
    sort: LOAN_SORTS.find((candidate) => candidate === single(params, 'sort')) ?? 'recent',
    page: parsePage(params),
    asOf: status === 'overdue' && asOf !== undefined && isCalendarDate(asOf) ? asOf : undefined,
  };
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
