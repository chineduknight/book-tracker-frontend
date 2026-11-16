import 'server-only';
import type { ApiClient } from '@/lib/api/client';
import type { Page } from '@/lib/api/contract';
import type { LoanListQuery } from '@/lib/lending/queries';
import { LOAN_STATUSES, type LoanStatusFilter } from '@/lib/lending/rules';
import type { Loan } from '@/lib/lending/types';
import { PAGE_SIZE } from '@/lib/library/rules';
import type { Book, PhysicalCopy } from '@/lib/library/types';
import { getCopy } from '../library/library-api';
import { lookUpBooks, mapBounded, orNullIfMissing } from '../reading/book-lookup';
import { listLoans } from './lending-api';

export interface LoanRow {
  loan: Loan;
  /** null when the book is no longer in the reader's library (deleted since). */
  book: Book | null;
  /** null when the copy is no longer available (deleted, or its book was). */
  copy: PhysicalCopy | null;
}

/**
 * The copies behind a page of loans, each fetched once and at most four at a time. Only a 404 means
 * "no longer available"; any other failure rejects, so an outage is never shown as deleted records.
 */
export async function lookUpCopies(
  api: ApiClient,
  copyIds: readonly string[],
): Promise<Map<string, PhysicalCopy | null>> {
  const unique = [...new Set(copyIds)].slice(0, 100);
  const copies = await mapBounded(unique, (copyId) => orNullIfMissing(getCopy(api, copyId)));
  return new Map(unique.map((copyId, index) => [copyId, copies[index] ?? null]));
}

export async function loanRowsOf(api: ApiClient, loans: readonly Loan[]): Promise<LoanRow[]> {
  const [books, copies] = await Promise.all([
    lookUpBooks(
      api,
      loans.map((loan) => loan.bookId),
    ),
    lookUpCopies(
      api,
      loans.map((loan) => loan.copyId),
    ),
  ]);
  return loans.map((loan) => ({
    loan,
    book: books.get(loan.bookId) ?? null,
    copy: copies.get(loan.copyId) ?? null,
  }));
}

export interface LoanLedgerPage {
  rows: LoanRow[];
  pagination: Page<Loan>['pagination'];
  /** Each filter's total from the API (`limit=1` requests), never counted from one page. */
  totals: Record<LoanStatusFilter, number>;
  /** The reference day used for "overdue", explicit so counts, rows and labels agree. */
  asOf: string;
}

/** One page of the global loan ledger, including loans of copies or books deleted since. */
export async function loadLoanLedger(
  api: ApiClient,
  query: LoanListQuery,
  asOf: string,
): Promise<LoanLedgerPage> {
  const [page, ...counts] = await Promise.all([
    listLoans(api, {
      page: query.page,
      limit: PAGE_SIZE,
      status: query.status,
      sort: query.sort,
      asOf,
    }),
    ...LOAN_STATUSES.map((status) => listLoans(api, { page: 1, limit: 1, status, asOf })),
  ]);
  const totals = Object.fromEntries(
    LOAN_STATUSES.map((status, index) => [status, counts[index]?.pagination.total ?? 0]),
  ) as Record<LoanStatusFilter, number>;
  return { rows: await loanRowsOf(api, page.items), pagination: page.pagination, totals, asOf };
}
