import type { Metadata } from 'next';
import { LibrarySectionPage } from '@/components/layout/library-section-page';

export const metadata: Metadata = { title: 'Wishlist' };

export default function WishlistPage() {
  return <LibrarySectionPage href="/library/wishlist" emptyTitle="Your wishlist is empty" />;
}
