import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { librarySections } from '@/config/navigation';

type LibrarySectionHref = (typeof librarySections)[number]['href'];

/** The shared placeholder for a Library subsection (Categories, Collections, Wishlist). */
export function LibrarySectionPage({
  href,
  emptyTitle,
}: {
  href: LibrarySectionHref;
  emptyTitle: string;
}) {
  const section = librarySections.find((item) => item.href === href);
  if (!section) throw new Error(`Unknown library section: ${href}`);

  return (
    <>
      <PageHeader
        title={section.label}
        description={section.summary}
        before={
          <nav aria-label="Breadcrumb">
            <Link
              href="/library"
              className="-ml-1 inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-sm font-medium text-accent hover:text-accent-hover"
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
              Library
            </Link>
          </nav>
        }
      />
      <EmptyState
        icon={section.icon}
        title={emptyTitle}
        description={`${section.label} arrive with the Library milestone. There is nothing to manage here yet.`}
        action={{ href: '/library', label: 'Back to Library' }}
      />
    </>
  );
}
