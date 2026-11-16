import type { Metadata, Route } from 'next';
import { notFound } from 'next/navigation';
import { describeLoanDates, LoanStateBadge, LoanSubject } from '@/components/lending/loan-display';
import { LoanEditor } from '@/components/lending/loan-editor';
import { DataUnavailable } from '@/components/library/data-unavailable';
import { LibraryBreadcrumb } from '@/components/library/library-breadcrumb';
import { Notice } from '@/components/library/notice';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { SectionHeader } from '@/components/ui/section-header';
import { ApiError } from '@/lib/api/errors';
import { formatCalendarDate, formatTimestampDay } from '@/lib/dates/calendar-date';
import { utcToday } from '@/lib/lending/rules';
import { loanReference, type CopyLoanOverview } from '@/lib/lending/types';
import { isObjectId } from '@/lib/library/rules';
import { requireSignedInProfile } from '@/server/current-session';
import { getCopyLoanOverview, getLoan } from '@/server/lending/lending-api';
import { getBook, getCopy } from '@/server/library/library-api';
import { loadAsReader } from '@/server/library/reader-data';
import { orNullIfMissing } from '@/server/reading/book-lookup';

export const metadata: Metadata = { title: 'Loan' };

export default async function LoanPage({ params, searchParams }: PageProps<'/lending/[loanId]'>) {
  await requireSignedInProfile();
  const { loanId } = await params;
  const { notice } = await searchParams;
  if (!isObjectId(loanId)) notFound();
  const back = <LibraryBreadcrumb href="/lending" label="Lending" />;

  const result = await loadAsReader(async (api) => {
    const loan = await getLoan(api, loanId.toLowerCase());
    // The loan outlives its copy and book: either may be gone (404), which is not an error here.
    const [book, copy] = await Promise.all([
      orNullIfMissing(getBook(api, loan.bookId)),
      orNullIfMissing(getCopy(api, loan.copyId)),
    ]);
    let overview: CopyLoanOverview | null = null;
    if (copy && loan.returnedOn !== null) {
      try {
        overview = await getCopyLoanOverview(api, copy.id);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) throw error;
        overview = null; // Unknown: no "lend again" offer rather than a guess.
      }
    }
    return { loan, book, copy, overview };
  });
  if (result.status === 'not-found') notFound();
  if (result.status === 'unavailable') {
    return (
      <>
        <PageHeader title="Loan" before={back} />
        <DataUnavailable
          what="loan"
          retryHref={`/lending/${loanId}`}
          retryAfterSeconds={result.retryAfterSeconds}
        />
      </>
    );
  }

  const { loan, book, copy, overview } = result.value;
  const asOf = utcToday();
  const canLendAgain = copy !== null && overview !== null && !overview.isOnLoan;
  return (
    <>
      <PageHeader title={`Lent to ${loan.borrowerName}`} before={back} />
      <Notice notice={notice} />

      <Card className="mb-8 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <LoanStateBadge loan={loan} asOf={asOf} />
          <span className="text-xs text-ink-muted">
            Loan {loanReference(loan)} · recorded {formatTimestampDay(loan.createdAt)}
          </span>
        </div>
        <LoanSubject loan={loan} book={book} copy={copy} />
        <p className="text-base text-ink">{describeLoanDates(loan)}</p>
        {loan.returnedOn === null && loan.dueOn ? (
          <p className="text-xs text-ink-muted">
            Overdue status is as of {formatCalendarDate(asOf)} (today, as a UTC calendar day).
          </p>
        ) : null}
        {loan.borrowerContact ? (
          <p className="text-sm wrap-anywhere text-ink">Contact: {loan.borrowerContact}</p>
        ) : null}
        {loan.note ? (
          <p className="max-w-prose text-sm whitespace-pre-wrap wrap-anywhere text-ink">
            {loan.note}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3 pt-2">
          {copy ? (
            <ButtonLink href={`/lending/copies/${copy.id}` as Route} variant="secondary">
              This copy’s loans
            </ButtonLink>
          ) : null}
          {canLendAgain ? (
            <ButtonLink href={`/lending/new?copyId=${copy.id}` as Route} variant="secondary">
              Record a new loan of this copy
            </ButtonLink>
          ) : null}
        </div>
      </Card>

      <section aria-labelledby="loan-edit-heading">
        <SectionHeader
          id="loan-edit-heading"
          title={loan.returnedOn === null ? 'Update this loan' : 'Correct this loan'}
          description={
            loan.returnedOn === null
              ? 'Correct the details, or mark it returned when the copy is back.'
              : 'This loan is returned and stays that way. You can still correct its details and the return day.'
          }
        />
        <Card>
          <LoanEditor key={`${loan.updatedAt}-${loan.returnedOn ?? 'out'}`} loan={loan} />
        </Card>
      </section>
    </>
  );
}
