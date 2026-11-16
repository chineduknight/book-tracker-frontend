import Link from 'next/link';
import type { Route } from 'next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Pagination as PageInfo } from '@/lib/api/contract';

interface PaginationProps {
  pagination: PageInfo;
  hrefFor: (page: number) => string;
  /** e.g. "books", for "Page 2 of 5 · 93 books". */
  noun: string;
}

/** Server-rendered pagination: real links that work without JavaScript. */
export function Pagination({ pagination, hrefFor, noun }: PaginationProps) {
  const { page, totalPages, total } = pagination;
  if (totalPages <= 1) return null;
  const linkClass =
    'inline-flex min-h-11 items-center gap-1 rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium text-ink hover:bg-surface-muted';

  return (
    <nav aria-label="Pagination" className="mt-6 flex flex-wrap items-center justify-between gap-3">
      {page > 1 ? (
        <Link href={hrefFor(Math.min(page - 1, totalPages)) as Route} className={linkClass}>
          <ChevronLeft aria-hidden="true" className="size-4" />
          Previous
        </Link>
      ) : (
        <span />
      )}
      <p className="text-sm text-ink-muted">
        Page {page} of {totalPages} · {total} {noun}
      </p>
      {page < totalPages ? (
        <Link href={hrefFor(page + 1) as Route} className={linkClass}>
          Next
          <ChevronRight aria-hidden="true" className="size-4" />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
