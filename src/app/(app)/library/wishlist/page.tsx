import type { Metadata } from 'next';
import { LibrarySectionPage } from '@/components/layout/library-section-page';
import { requireSignedInProfile } from '@/server/current-session';

export const metadata: Metadata = { title: 'Wishlist' };

export default async function WishlistPage() {
  await requireSignedInProfile();
  return <LibrarySectionPage href="/library/wishlist" emptyTitle="Your wishlist is empty" />;
}
