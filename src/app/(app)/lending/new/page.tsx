import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { describeLoanDates } from '@/components/lending/loan-display';
import { LendBookPicker } from '@/components/lending/lend-book-picker';
import { NewLoanForm } from '@/components/lending/new-loan-form';
import { authorLine } from '@/components/library/book-summary';
import { DataUnavailable } from '@/components/library/data-unavailable';
import { LibraryBreadcrumb } from '@/components/library/library-breadcrumb';
import { Pagination } from '@/components/library/pagination';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { InlineError } from '@/components/ui/inline-error';
import { PageHeader } from '@/components/ui/page-header';
import { ApiError } from '@/lib/api/errors';
import { copyAddedOn, copyName } from '@/lib/library/copy-name';
import { parsePage } from '@/lib/library/queries';
import { CONDITION_LABELS, isObjectId, PAGE_SIZE } from '@/lib/library/rules';
import type { CopyLoanOverview } from '@/lib/lending/types';
import { requireSignedInProfile } from '@/server/current-session';
import { getCopyLoanOverview } from '@/server/lending/lending-api';
import { getBook, getCopy, listCopies } from '@/server/library/library-api';
import { loadAsReader } from '@/server/library/reader-data';

export const metadata: Metadata = { title: 'Record a loan' };

const back = <LibraryBreadcrumb href="/lending" label="Lending" />;

export default async function NewLoanPage({ searchParams }: PageProps<'/lending/new'>) {
  await requireSignedInProfile();
  const params = await searchParams;
  if (isObjectId(params.copyId)) return <LendCopy copyId={params.copyId.toLowerCase()} />;
  if (isObjectId(params.bookId)) {
    return <ChooseCopy bookId={params.bookId.toLowerCase()} page={parsePage(params)} />;
  }
  return (
    <>
      <PageHeader
        title="Record a loan"
        description="Loans are for physical copies: choose the book, then the exact copy you’re lending."
        before={back}
      />
      <Card>
        <LendBookPicker />
      </Card>
    </>
  );
}

/** Step two: one of the book's physical copies, paged, each named by its stable reference. */
async function ChooseCopy({ bookId, page }: { bookId: string; page: number }) {
  const result = await loadAsReader(async (api) => {
    const book = await getBook(api, bookId);
    const copies =
      book.format === 'physical' ? await listCopies(api, bookId, page, PAGE_SIZE) : null;
    return { book, copies };
  });
  if (result.status === 'not-found') notFound();
  if (result.status === 'unavailable') {
    return (
      <>
        <PageHeader title="Record a loan" before={back} />
        <DataUnavailable
          what="copies"
          retryHref={`/lending/new?bookId=${bookId}`}
          retryAfterSeconds={result.retryAfterSeconds}
        />
      </>
    );
  }
  const { book, copies } = result.value;
  return (
    <>
      <PageHeader
        title={`Lend “${book.title}”`}
        description="Choose the copy you’re lending."
        before={back}
      />
      {!copies ? (
        <Card className="flex flex-col gap-3">
          <p className="text-sm text-ink">
            This is an ebook. Ebooks have no physical copies, so they can’t be lent.
          </p>
          <ButtonLink href="/lending/new" variant="secondary" className="w-fit">
            Choose another book
          </ButtonLink>
        </Card>
      ) : copies.pagination.total === 0 ? (
        <Card className="flex flex-col gap-3">
          <p className="text-sm text-ink">This book has no physical copies recorded yet.</p>
          <ButtonLink
            href={`/library/books/${book.id}` as Route}
            variant="secondary"
            className="w-fit"
          >
            Add a copy on the book’s page
          </ButtonLink>
        </Card>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {copies.items.map((copy) => (
              <li
                key={copy.id}
                className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4 @md:flex-row @md:items-center @md:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-medium wrap-anywhere text-ink">{copyName(copy)}</p>
                  <p className="text-xs text-ink-muted">Added {copyAddedOn(copy)}</p>
                  {copy.condition ? (
                    <Badge className="mt-1">{CONDITION_LABELS[copy.condition]}</Badge>
                  ) : null}
                </div>
                <ButtonLink
                  href={`/lending/new?copyId=${copy.id}` as Route}
                  variant="secondary"
                  className="min-w-0 max-w-full shrink-0"
                  aria-label={`Lend this copy: ${copyName(copy)}`}
                >
                  Lend this copy
                </ButtonLink>
              </li>
            ))}
          </ul>
          <Pagination
            pagination={copies.pagination}
            noun={copies.pagination.total === 1 ? 'copy' : 'copies'}
            hrefFor={(next) => `/lending/new?bookId=${book.id}&page=${next}`}
          />
        </>
      )}
    </>
  );
}

type Availability = { known: true; overview: CopyLoanOverview } | { known: false };

/** Step three: the loan form for one copy, after checking (not trusting) its current status. */
async function LendCopy({ copyId }: { copyId: string }) {
  const result = await loadAsReader(async (api) => {
    const copy = await getCopy(api, copyId);
    const book = await getBook(api, copy.bookId);
    let availability: Availability;
    try {
      availability = { known: true, overview: await getCopyLoanOverview(api, copyId) };
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) throw error;
      availability = { known: false };
    }
    return { copy, book, availability };
  });
  if (result.status === 'not-found') notFound();
  if (result.status === 'unavailable') {
    return (
      <>
        <PageHeader title="Record a loan" before={back} />
        <DataUnavailable
          what="copy"
          retryHref={`/lending/new?copyId=${copyId}`}
          retryAfterSeconds={result.retryAfterSeconds}
        />
      </>
    );
  }
  const { copy, book, availability } = result.value;
  const activeLoan = availability.known ? availability.overview.activeLoan : null;
  return (
    <>
      <PageHeader
        title={`Lend ${copyName(copy)}`}
        description={`${book.title} · ${authorLine(book.authors)}`}
        before={back}
      />
      <Card className="mb-6 text-sm">
        {activeLoan ? (
          <div className="flex flex-col gap-3">
            <p className="text-ink">
              This copy is already lent to {activeLoan.borrowerName} (
              {describeLoanDates(activeLoan)}
              ). A copy has one loan at a time: mark that loan returned before lending it again.
            </p>
            <ButtonLink href={`/lending/${activeLoan.id}` as Route} className="w-fit">
              Open the current loan
            </ButtonLink>
          </div>
        ) : availability.known ? (
          <p className="text-ink">
            Not on loan right now.{' '}
            <Link
              href={`/lending/copies/${copy.id}` as Route}
              className="font-medium text-accent hover:text-accent-hover"
            >
              Earlier loans of this copy
            </Link>
          </p>
        ) : (
          <InlineError title="Couldn’t check whether this copy is on loan.">
            <p>
              You can still record the loan: Avuneri refuses it if the copy turns out to be out
              already.
            </p>
          </InlineError>
        )}
      </Card>
      {activeLoan ? null : (
        <Card>
          <NewLoanForm copyId={copy.id} bookId={book.id} />
        </Card>
      )}
    </>
  );
}
