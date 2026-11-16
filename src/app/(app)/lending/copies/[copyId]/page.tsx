import type { Metadata, Route } from 'next';
import { notFound } from 'next/navigation';
import { describeLoanDates, LoanStateBadge } from '@/components/lending/loan-display';
import { DataUnavailable } from '@/components/library/data-unavailable';
import { LibraryBreadcrumb } from '@/components/library/library-breadcrumb';
import { Pagination } from '@/components/library/pagination';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import Link from 'next/link';
import { copyName } from '@/lib/library/copy-name';
import { parsePage } from '@/lib/library/queries';
import { isObjectId, PAGE_SIZE } from '@/lib/library/rules';
import { utcToday } from '@/lib/lending/rules';
import { loanReference } from '@/lib/lending/types';
import { requireSignedInProfile } from '@/server/current-session';
import { getCopyLoanOverview, listCopyLoans } from '@/server/lending/lending-api';
import { getBook, getCopy } from '@/server/library/library-api';
import { loadAsReader } from '@/server/library/reader-data';

export const metadata: Metadata = { title: 'Copy loans' };

/**
 * Every loan of one visible copy, newest first, paged by the API. A returned loan is history,
 * never a current lock. Once the copy is deleted this page is "not found", while its loans stay in
 * the global Lending list.
 */
export default async function CopyLoansPage({
  params,
  searchParams,
}: PageProps<'/lending/copies/[copyId]'>) {
  await requireSignedInProfile();
  const { copyId } = await params;
  const page = parsePage(await searchParams);
  if (!isObjectId(copyId)) notFound();
  const id = copyId.toLowerCase();
  const back = <LibraryBreadcrumb href="/lending" label="Lending" />;

  const result = await loadAsReader(async (api) => {
    const copy = await getCopy(api, id);
    const [book, overview, loans] = await Promise.all([
      getBook(api, copy.bookId),
      getCopyLoanOverview(api, id),
      listCopyLoans(api, id, { page, limit: PAGE_SIZE, status: 'all', sort: 'recent' }),
    ]);
    return { copy, book, overview, loans };
  });
  if (result.status === 'not-found') notFound();
  if (result.status === 'unavailable') {
    return (
      <>
        <PageHeader title="Copy loans" before={back} />
        <DataUnavailable
          what="loans"
          retryHref={`/lending/copies/${id}`}
          retryAfterSeconds={result.retryAfterSeconds}
        />
      </>
    );
  }

  const { copy, book, overview, loans } = result.value;
  const asOf = utcToday();
  return (
    <>
      <PageHeader title={`Loans of ${copyName(copy)}`} description={book.title} before={back} />
      <Card className="mb-6 flex flex-col gap-3 text-sm">
        {overview.activeLoan ? (
          <p className="text-ink">
            On loan now to {overview.activeLoan.borrowerName}.{' '}
            <Link
              href={`/lending/${overview.activeLoan.id}` as Route}
              className="font-medium text-accent hover:text-accent-hover"
            >
              Open the current loan
            </Link>
          </p>
        ) : (
          <p className="text-ink">Not on loan right now.</p>
        )}
        <div className="flex flex-wrap gap-3">
          {overview.activeLoan ? null : (
            <ButtonLink href={`/lending/new?copyId=${copy.id}` as Route}>Lend this copy</ButtonLink>
          )}
          <ButtonLink href={`/library/books/${book.id}` as Route} variant="secondary">
            Book details
          </ButtonLink>
        </div>
      </Card>
      {loans.pagination.total === 0 ? (
        <p className="text-sm text-ink-muted">This copy has never been lent.</p>
      ) : loans.items.length === 0 ? (
        <p className="text-sm text-ink-muted">
          There are no loans on this page.{' '}
          <Link href={`/lending/copies/${id}` as Route} className="font-medium text-accent">
            Go to the first page
          </Link>
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {loans.items.map((loan) => (
              <li
                key={loan.id}
                className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/lending/${loan.id}` as Route}
                    className="min-w-0 font-medium wrap-anywhere text-ink hover:text-accent"
                  >
                    {loan.borrowerName}
                  </Link>
                  <LoanStateBadge loan={loan} asOf={asOf} />
                  <span className="text-xs text-ink-muted">Loan {loanReference(loan)}</span>
                </div>
                <p className="text-sm text-ink">{describeLoanDates(loan)}</p>
              </li>
            ))}
          </ul>
          <Pagination
            pagination={loans.pagination}
            noun={loans.pagination.total === 1 ? 'loan' : 'loans'}
            hrefFor={(next) => `/lending/copies/${id}?page=${next}`}
          />
        </>
      )}
    </>
  );
}
