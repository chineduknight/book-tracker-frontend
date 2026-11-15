import type { Metadata } from 'next';
import { LibraryBig } from 'lucide-react';
import { LinkCard } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { SectionHeader } from '@/components/ui/section-header';
import { findDestination, librarySections } from '@/config/navigation';
import { requireSignedInProfile } from '@/server/current-session';

export const metadata: Metadata = { title: 'Library' };

export default async function LibraryPage() {
  await requireSignedInProfile();
  const { label, summary } = findDestination('/library');

  return (
    <>
      <PageHeader title={label} description={summary} />

      <div className="mb-10">
        <EmptyState
          icon={LibraryBig}
          title="Your catalogue will appear here"
          description="Adding books, physical copies and where each copy lives arrives in the Library milestone. Until then this space is intentionally empty."
        />
      </div>

      <section aria-labelledby="library-sections">
        <SectionHeader
          id="library-sections"
          title="Organise your library"
          description="Categories, collections and your wishlist live inside the Library."
        />
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {librarySections.map(({ href, label: title, icon, summary: description }) => (
            <li key={href}>
              <LinkCard
                href={href}
                title={title}
                description={description}
                icon={icon}
                status="Coming soon"
              />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
