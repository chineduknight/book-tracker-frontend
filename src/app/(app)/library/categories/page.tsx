import type { Metadata } from 'next';
import { LibrarySectionPage } from '@/components/layout/library-section-page';
import { requireSignedInProfile } from '@/server/current-session';

export const metadata: Metadata = { title: 'Categories' };

export default async function CategoriesPage() {
  await requireSignedInProfile();
  return <LibrarySectionPage href="/library/categories" emptyTitle="No categories yet" />;
}
