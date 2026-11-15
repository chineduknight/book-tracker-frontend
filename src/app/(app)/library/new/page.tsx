import type { Metadata } from 'next';
import { BookForm } from '@/components/library/book-form';
import { LibraryBreadcrumb } from '@/components/library/library-breadcrumb';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { requireSignedInProfile } from '@/server/current-session';

export const metadata: Metadata = { title: 'Add a book' };

export default async function NewBookPage() {
  await requireSignedInProfile();
  return (
    <>
      <PageHeader
        title="Add a book"
        description="A catalogue entry for a book you own. Physical copies are added afterwards, on the book’s page."
        before={<LibraryBreadcrumb />}
      />
      <Card>
        <BookForm />
      </Card>
    </>
  );
}
