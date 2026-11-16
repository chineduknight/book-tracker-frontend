/**
 * One lending event of one physical copy. `copyId` and `bookId` are fixed at creation and may point
 * to records deleted since; the loan itself stays listed and returnable. Dates are calendar days.
 */
export interface Loan {
  id: string;
  copyId: string;
  bookId: string;
  borrowerName: string;
  borrowerContact?: string | undefined;
  lentOn: string;
  dueOn?: string | undefined;
  /** Always present; null while the loan is active. */
  returnedOn: string | null;
  note?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

/** Whether a visible copy is out right now; derived by the API, never stored on the copy. */
export interface CopyLoanOverview {
  copyId: string;
  isOnLoan: boolean;
  activeLoan: Loan | null;
}

export type LoanState = 'active' | 'overdue' | 'returned';

/**
 * A loan's state on a known reference day, as the API defines it: overdue only while active, with a
 * due date strictly before `asOf`. Due on the reference day is not overdue; no due date never is.
 * Calendar days compare as text, so no time zone can move the boundary.
 */
export function loanStateOn(loan: Pick<Loan, 'returnedOn' | 'dueOn'>, asOf: string): LoanState {
  if (loan.returnedOn !== null) return 'returned';
  return loan.dueOn !== undefined && loan.dueOn < asOf ? 'overdue' : 'active';
}

/** "#a1b2c3": a stable reference to a loan that never depends on list position. */
export function loanReference(loan: Pick<Loan, 'id'>): string {
  return `#${loan.id.slice(-6)}`;
}
