import type { Metadata } from 'next';
import { LibrarySectionPage } from '@/components/layout/library-section-page';

export const metadata: Metadata = { title: 'Collections' };

export default function CollectionsPage() {
  return <LibrarySectionPage href="/library/collections" emptyTitle="No collections yet" />;
}
