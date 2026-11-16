import type { Route } from 'next';
import Link from 'next/link';
import { loanReference } from '@/lib/lending/types';
import type { LoanRow } from '@/server/lending/lending-pages';
import { describeLoanDates, LoanStateBadge, LoanSubject } from './loan-display';

/** Loan rows: who has it, which book and copy (when they still exist), the days, and the state. */
export function LoanList({ rows, asOf }: { rows: LoanRow[]; asOf: string }) {
  return (
    <ul className="flex flex-col gap-3">
      {rows.map(({ loan, book, copy }) => (
        <li
          key={loan.id}
          className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface p-4"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/lending/${loan.id}` as Route}
              className="min-w-0 font-serif text-lg font-semibold wrap-anywhere text-ink hover:text-accent"
            >
              {loan.borrowerName}
            </Link>
            <LoanStateBadge loan={loan} asOf={asOf} />
            <span className="text-xs text-ink-muted">Loan {loanReference(loan)}</span>
          </div>
          <LoanSubject loan={loan} book={book} copy={copy} />
          <p className="text-sm text-ink">{describeLoanDates(loan)}</p>
        </li>
      ))}
    </ul>
  );
}
