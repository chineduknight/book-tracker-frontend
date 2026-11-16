import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BookForm } from '@/components/library/book-form';
import { DataUnavailable } from '@/components/library/data-unavailable';
import { LibraryBreadcrumb } from '@/components/library/library-breadcrumb';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { requireSignedInProfile } from '@/server/current-session';
import { getBook } from '@/server/library/library-api';
import { loadAsReader } from '@/server/library/reader-data';

export const metadata: Metadata = { title: 'Edit book' };

export default async function EditBookPage({ params }: PageProps<'/library/books/[bookId]/edit'>) {
  await requireSignedInProfile();
  const { bookId } = await params;
  const result = await loadAsReader((api) => getBook(api, bookId));
  if (result.status === 'not-found') notFound();

  const back = <LibraryBreadcrumb href={`/library/books/${bookId}`} label="Back to the book" />;
  if (result.status === 'unavailable') {
    return (
      <>
        <PageHeader title="Edit book" before={back} />
        <DataUnavailable what="book" retryHref={`/library/books/${bookId}/edit`} />
      </>
    );
  }
  return (
    <>
      <PageHeader title="Edit book" description={result.value.title} before={back} />
      <Card>
        <BookForm book={result.value} />
      </Card>
    </>
  );
}
