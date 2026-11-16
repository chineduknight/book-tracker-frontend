import Link from 'next/link';
import type { Route } from 'next';
import { ChevronLeft } from 'lucide-react';

export function LibraryBreadcrumb({
  href = '/library',
  label = 'Library',
}: {
  href?: string;
  label?: string;
}) {
  return (
    <nav aria-label="Breadcrumb">
      <Link
        href={href as Route}
        className="-ml-1 inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-sm font-medium text-accent hover:text-accent-hover"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        {label}
      </Link>
    </nav>
  );
}
