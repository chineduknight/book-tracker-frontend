import type { Metadata } from 'next';
import { LibrarySectionPage } from '@/components/layout/library-section-page';
import { requireSignedInProfile } from '@/server/current-session';

export const metadata: Metadata = { title: 'Collections' };

export default async function CollectionsPage() {
  await requireSignedInProfile();
  return <LibrarySectionPage href="/library/collections" emptyTitle="No collections yet" />;
}
