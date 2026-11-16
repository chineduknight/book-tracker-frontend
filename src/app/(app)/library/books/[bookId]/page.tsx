import type { Metadata, Route } from 'next';
import { notFound } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { BookCover } from '@/components/library/book-cover';
import { authorLine } from '@/components/library/book-summary';
import { CopiesManager } from '@/components/library/copies-manager';
import { DataUnavailable } from '@/components/library/data-unavailable';
import { DeleteButton } from '@/components/library/delete-button';
import { ExternalLink } from '@/components/library/external-link';
import { BookGroupsEditor } from '@/components/library/group-membership';
import { LibraryBreadcrumb } from '@/components/library/library-breadcrumb';
import { Notice } from '@/components/library/notice';
import { BookNotesSection } from '@/components/notes/book-notes-section';
import { BookReadingSection } from '@/components/reading/book-reading-section';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { SectionHeader } from '@/components/ui/section-header';
import { FORMAT_LABELS } from '@/lib/library/rules';
import type { Book } from '@/lib/library/types';
import { requireSignedInProfile } from '@/server/current-session';
import {
  getBook,
  getBookOrganization,
  listAllGroups,
  listAllLocations,
  listCopies,
} from '@/server/library/library-api';
import { loadAsReader } from '@/server/library/reader-data';
import { listBookNotes } from '@/server/notes/note-api';
import { getReadingOverview, listBookSessions } from '@/server/reading/reading-api';

export const metadata: Metadata = { title: 'Book' };

export default async function BookPage({
  params,
  searchParams,
}: PageProps<'/library/books/[bookId]'>) {
  await requireSignedInProfile();
  const { bookId } = await params;
  const { notice } = await searchParams;
  const result = await loadAsReader(async (api) => {
    const book = await getBook(api, bookId);
    const [copies, locations, organization, categories, collections] = await Promise.all([
      book.format === 'physical' ? listCopies(api, book.id, 1) : Promise.resolve(null),
      book.format === 'physical' ? listAllLocations(api) : Promise.resolve([]),
      getBookOrganization(api, book.id),
      listAllGroups(api, 'categories'),
      listAllGroups(api, 'collections'),
    ]);
    return { book, copies, locations, organization, categories, collections };
  });

  if (result.status === 'not-found') notFound();
  if (result.status === 'unavailable') {
    return (
      <>
        <PageHeader title="Book" before={<LibraryBreadcrumb />} />
        <DataUnavailable
          what="book"
          retryHref={`/library/books/${bookId}`}
          retryAfterSeconds={result.retryAfterSeconds}
        />
      </>
    );
  }

  const { book, copies, locations, organization, categories, collections } = result.value;
  // Reading and notes degrade on their own: an outage there never hides a healthy book record.
  const [reading, notes] = await Promise.all([
    loadAsReader(async (api) => {
      const [overview, recent] = await Promise.all([
        getReadingOverview(api, book.id),
        listBookSessions(api, book.id, { page: 1, limit: 5 }),
      ]);
      return { overview, recent };
    }),
    loadAsReader((api) => listBookNotes(api, book.id, { page: 1, limit: 3 })),
  ]);
  return (
    <>
      <PageHeader
        title={book.title}
        description={authorLine(book.authors)}
        before={<LibraryBreadcrumb />}
      />
      <Notice notice={notice} />
      <div className="mb-8 flex flex-wrap gap-3">
        <ButtonLink href={`/library/books/${book.id}/edit` as Route} variant="secondary">
          <Pencil aria-hidden="true" className="size-4" />
          Edit book
        </ButtonLink>
        <DeleteButton
          path={`/api/library/books/${book.id}`}
          label="Delete book"
          title={`Delete “${book.title}”?`}
          redirectTo="/library?notice=book-deleted"
        >
          It will disappear from your library, its categories and collections, and searches. Its
          copies are hidden with it. Loans of its copies stay in Lending, where any still out can be
          returned. There is no way to restore the book from here.
        </DeleteButton>
      </div>

      <Card className="mb-10">
        <BookDetails book={book} />
      </Card>

      <BookReadingSection book={book} data={reading} />
      <BookNotesSection bookId={book.id} data={notes} />

      <section aria-labelledby="copies-heading" className="mb-10">
        <SectionHeader
          id="copies-heading"
          title="Physical copies"
          description={
            book.format === 'physical'
              ? 'Each copy is a separate item: label it, note its condition and where it is kept.'
              : undefined
          }
        />
        {copies ? (
          <>
            <CopiesManager bookId={book.id} copies={copies.items} locations={locations} />
            {copies.pagination.totalPages > 1 ? (
              <p className="mt-3 text-sm text-ink-muted">
                Showing the newest 100 of {copies.pagination.total} copies.
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-ink-muted">
            Ebooks have no physical copies. To record a printed copy, add it as a separate physical
            book.
          </p>
        )}
      </section>

      <section aria-labelledby="organise-heading" className="flex flex-col gap-8">
        <SectionHeader
          id="organise-heading"
          title="Categories and collections"
          description="Group this book by subject or into your own lists. A book can be in any number of each."
        />
        <div>
          <h3 className="mb-3 text-sm font-semibold text-ink">Categories</h3>
          <BookGroupsEditor
            kind="categories"
            bookId={book.id}
            memberOf={organization.categories}
            allGroups={categories}
          />
        </div>
        <div>
          <h3 className="mb-3 text-sm font-semibold text-ink">Collections</h3>
          <BookGroupsEditor
            kind="collections"
            bookId={book.id}
            memberOf={organization.collections}
            allGroups={collections}
          />
        </div>
      </section>
    </>
  );
}

function BookDetails({ book }: { book: Book }) {
  const facts: Array<[string, string | number | undefined]> = [
    ['ISBN', book.isbn],
    ['Edition', book.edition],
    ['Published', book.publicationYear],
    ['Pages', book.pageCount],
    ['Chapters', book.chapterCount],
  ];
  return (
    <div className="flex flex-col gap-5 sm:flex-row">
      <BookCover className="w-20" />
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Badge>{FORMAT_LABELS[book.format]}</Badge>
        </div>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {facts
            .filter(([, value]) => value !== undefined)
            .map(([term, value]) => (
              <div key={term} className="flex gap-2">
                <dt className="text-ink-muted">{term}</dt>
                <dd className="font-medium break-all text-ink">{value}</dd>
              </div>
            ))}
        </dl>
        {book.description ? (
          <p className="max-w-prose text-sm break-words whitespace-pre-line text-ink">
            {book.description}
          </p>
        ) : null}
        {book.coverUrl ? (
          <p className="text-sm">
            <ExternalLink href={book.coverUrl}>Cover image</ExternalLink>
          </p>
        ) : null}
      </div>
    </div>
  );
}
