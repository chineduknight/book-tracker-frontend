/** Loan values and limits, mirroring book-tracker-backend's loans module exactly. */
export const LOAN_STATUSES = ['active', 'overdue', 'returned', 'all'] as const;
export type LoanStatusFilter = (typeof LOAN_STATUSES)[number];

export const LOAN_STATUS_LABELS: Record<LoanStatusFilter, string> = {
  active: 'Active',
  overdue: 'Overdue',
  returned: 'Returned',
  all: 'All',
};

export const LOAN_SORTS = ['recent', 'oldest'] as const;
export type LoanSort = (typeof LOAN_SORTS)[number];
export const LOAN_SORT_LABELS: Record<LoanSort, string> = {
  recent: 'Recently recorded',
  oldest: 'Oldest recorded',
};

export const LOAN_LIMITS = { borrowerName: 160, borrowerContact: 200, note: 2_000 } as const;

/** Today's UTC calendar day: the API's own default reference day for "overdue". */
export function utcToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
