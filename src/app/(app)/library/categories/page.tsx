import type { Metadata } from 'next';
import { LibrarySectionPage } from '@/components/layout/library-section-page';

export const metadata: Metadata = { title: 'Categories' };

export default function CategoriesPage() {
  return <LibrarySectionPage href="/library/categories" emptyTitle="No categories yet" />;
}
