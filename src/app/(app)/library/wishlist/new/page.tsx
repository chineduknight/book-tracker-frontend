import type { Metadata } from 'next';
import { LibraryBreadcrumb } from '@/components/library/library-breadcrumb';
import { WishForm } from '@/components/library/wish-form';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { requireSignedInProfile } from '@/server/current-session';

export const metadata: Metadata = { title: 'Add a wish' };

export default async function NewWishPage() {
  await requireSignedInProfile();
  return (
    <>
      <PageHeader
        title="Add a wish"
        description="Only a title is needed. Duplicates are fine, for example another edition."
        before={<LibraryBreadcrumb href="/library/wishlist" label="Wishlist" />}
      />
      <Card>
        <WishForm />
      </Card>
    </>
  );
}
