import 'server-only';
import type { ApiClient } from '@/lib/api/client';
import type { Page } from '@/lib/api/contract';
import { apiPath } from '@/lib/api/path';
import type { LoanSort, LoanStatusFilter } from '@/lib/lending/rules';
import type { CopyLoanOverview, Loan } from '@/lib/lending/types';
import {
  copyLoanOverviewSchema,
  loanSchema,
  type CreateLoan,
  type UpdateLoan,
} from './lending-schemas';

/** One function per loans endpoint; each validates the API's response. There is no DELETE. */
const parseLoan = (data: unknown): Loan => loanSchema.parse(data);

export interface LoanQuery {
  page: number;
  limit: number;
  status: LoanStatusFilter;
  sort?: LoanSort | undefined;
  /** Only with status=overdue, as the API requires. */
  asOf?: string | undefined;
}

function queryOf(query: LoanQuery) {
  return {
    page: query.page,
    limit: query.limit,
    status: query.status,
    sort: query.sort,
    asOf: query.status === 'overdue' ? query.asOf : undefined,
  };
}

/** Every loan of the reader, including loans whose copy or book was deleted since. */
export function listLoans(api: ApiClient, query: LoanQuery): Promise<Page<Loan>> {
  return api.getPage(apiPath`/loans`, { query: queryOf(query), parse: parseLoan });
}

/** The loans of one currently visible copy (404 "Copy not found" otherwise). */
export function listCopyLoans(
  api: ApiClient,
  copyId: string,
  query: LoanQuery,
): Promise<Page<Loan>> {
  return api.getPage(apiPath`/copies/${copyId}/loans`, { query: queryOf(query), parse: parseLoan });
}

export function getCopyLoanOverview(api: ApiClient, copyId: string): Promise<CopyLoanOverview> {
  return api.get(apiPath`/copies/${copyId}/loan-overview`, {
    parse: (data) => copyLoanOverviewSchema.parse(data),
  });
}

export function getLoan(api: ApiClient, loanId: string): Promise<Loan> {
  return api.get(apiPath`/loans/${loanId}`, { parse: parseLoan });
}

export function createLoan(api: ApiClient, copyId: string, loan: CreateLoan): Promise<Loan> {
  return api.post(apiPath`/copies/${copyId}/loans`, { body: loan, parse: parseLoan });
}

export function updateLoan(api: ApiClient, loanId: string, changes: UpdateLoan): Promise<Loan> {
  return api.patch(apiPath`/loans/${loanId}`, { body: changes, parse: parseLoan });
}

/** Records the return with exactly `{ returnedOn }`; the same date again is an idempotent 200. */
export function returnLoan(api: ApiClient, loanId: string, returnedOn: string): Promise<Loan> {
  return api.put(apiPath`/loans/${loanId}/return`, { body: { returnedOn }, parse: parseLoan });
}
