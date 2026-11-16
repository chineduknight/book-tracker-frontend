import type { Route } from 'next';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { formatCalendarDate } from '@/lib/dates/calendar-date';
import { copyName, copyReference } from '@/lib/library/copy-name';
import type { Book, PhysicalCopy } from '@/lib/library/types';
import { loanStateOn, type Loan } from '@/lib/lending/types';

/**
 * A loan's state as words, never colour alone. "Overdue" is only claimed against a stated
 * reference day (`asOf`), exactly as the API defines it.
 */
export function LoanStateBadge({ loan, asOf }: { loan: Loan; asOf?: string | undefined }) {
  if (loan.returnedOn !== null) return <Badge>Returned</Badge>;
  if (asOf && loanStateOn(loan, asOf) === 'overdue') {
    return (
      <Badge className="border-danger text-danger">
        Overdue
        {loan.dueOn ? (
          <span className="sr-only">, due {formatCalendarDate(loan.dueOn)}</span>
        ) : null}
      </Badge>
    );
  }
  return <Badge className="border-accent bg-accent-soft text-accent-ink">On loan</Badge>;
}

/** "Lent 3 Mar 2026 · Due 17 Mar 2026 · Returned 15 Mar 2026", only the days on record. */
export function describeLoanDates(loan: Loan): string {
  return [
    `Lent ${formatCalendarDate(loan.lentOn)}`,
    loan.dueOn ? `Due ${formatCalendarDate(loan.dueOn)}` : 'No due date',
    loan.returnedOn ? `Returned ${formatCalendarDate(loan.returnedOn)}` : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Which book and copy a loan was for, linking only to records that still exist. */
export function LoanSubject({
  loan,
  book,
  copy,
}: {
  loan: Loan;
  book: Book | null;
  copy: PhysicalCopy | null;
}) {
  return (
    <p className="text-sm break-words text-ink-muted">
      {book ? (
        <Link
          href={`/library/books/${book.id}` as Route}
          className="font-medium text-accent hover:text-accent-hover"
        >
          {book.title}
        </Link>
      ) : (
        <span>Book no longer in your library</span>
      )}
      {' · '}
      {copy ? (
        <span>{copyName(copy)}</span>
      ) : (
        <span>Copy {copyReference({ id: loan.copyId })} no longer available</span>
      )}
    </p>
  );
}
