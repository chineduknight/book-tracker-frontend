import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { LibraryBig, Plus, SearchX } from 'lucide-react';
import { BookSummary } from '@/components/library/book-summary';
import { DataUnavailable } from '@/components/library/data-unavailable';
import { Notice } from '@/components/library/notice';
import { Pagination } from '@/components/library/pagination';
import { ButtonLink } from '@/components/ui/button';
import { LinkCard } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { SectionHeader } from '@/components/ui/section-header';
import { findDestination, librarySections } from '@/config/navigation';
import {
  BOOK_QUERY_DEFAULTS,
  hrefWithQuery,
  isFilteredBookQuery,
  parseBookListQuery,
  type BookListQuery,
} from '@/lib/library/queries';
import { BOOK_FORMATS, BOOK_SORTS, FORMAT_LABELS, LIMITS, SORT_LABELS } from '@/lib/library/rules';
import { requireSignedInProfile } from '@/server/current-session';
import { listBooks } from '@/server/library/library-api';
import { loadAsReader, type ReaderData } from '@/server/library/reader-data';
import type { Page } from '@/lib/api/contract';
import type { Book } from '@/lib/library/types';

export const metadata: Metadata = { title: 'Library' };

function libraryHref(query: BookListQuery, page = query.page): string {
  return hrefWithQuery(
    '/library',
    { q: query.q, format: query.format, sort: query.sort, page },
    BOOK_QUERY_DEFAULTS,
  );
}

export default async function LibraryPage({ searchParams }: PageProps<'/library'>) {
  await requireSignedInProfile();
  const params = await searchParams;
  const query = parseBookListQuery(params);
  const result = await loadAsReader((api) => listBooks(api, query));
  const { label, summary } = findDestination('/library');

  return (
    <>
      <PageHeader title={label} description={summary} />
      <Notice notice={params.notice} />
      <div className="mb-6 flex flex-wrap gap-3">
        <ButtonLink href="/library/new">
          <Plus aria-hidden="true" className="size-4" />
          Add book
        </ButtonLink>
      </div>

      <section aria-labelledby="catalogue-heading" className="mb-12">
        <h2 id="catalogue-heading" className="sr-only">
          Your books
        </h2>
        <form
          method="get"
          action="/library"
          role="search"
          aria-label="Search your books"
          className="mb-6 grid gap-3 rounded-xl border border-line bg-surface p-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end"
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="library-q" className="text-sm font-medium text-ink">
              Search titles and authors
            </label>
            <input
              id="library-q"
              name="q"
              type="search"
              maxLength={LIMITS.search}
              defaultValue={query.q ?? ''}
              aria-describedby="library-q-hint"
              className="min-h-11 rounded-lg border border-line-strong bg-surface px-3 text-base text-ink"
            />
            <p id="library-q-hint" className="text-xs text-ink-muted">
              Matches whole words in any order, e.g. “eliot march”.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="library-format" className="text-sm font-medium text-ink">
              Format
            </label>
            <select
              id="library-format"
              name="format"
              defaultValue={query.format ?? ''}
              className="min-h-11 rounded-lg border border-line-strong bg-surface px-3 text-base text-ink"
            >
              <option value="">All formats</option>
              {BOOK_FORMATS.map((format) => (
                <option key={format} value={format}>
                  {FORMAT_LABELS[format]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="library-sort" className="text-sm font-medium text-ink">
              Sort
            </label>
            <select
              id="library-sort"
              name="sort"
              defaultValue={query.sort}
              className="min-h-11 rounded-lg border border-line-strong bg-surface px-3 text-base text-ink"
            >
              {BOOK_SORTS.map((sort) => (
                <option key={sort} value={sort}>
                  {SORT_LABELS[sort]}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="min-h-11 rounded-lg bg-accent px-4 text-sm font-medium text-on-accent hover:bg-accent-hover"
          >
            Apply
          </button>
        </form>

        <CatalogueResults query={query} result={result} />
      </section>

      <section aria-labelledby="library-sections">
        <SectionHeader
          id="library-sections"
          title="Organise your library"
          description="Categories, collections, your wishlist and storage locations live inside the Library."
        />
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {librarySections.map(({ href, label: title, icon, summary: description }) => (
            <li key={href}>
              <LinkCard href={href} title={title} description={description} icon={icon} />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function CatalogueResults({
  query,
  result,
}: {
  query: BookListQuery;
  result: ReaderData<Page<Book>>;
}) {
  if (result.status !== 'ok') {
    return (
      <DataUnavailable
        what="books"
        retryHref={libraryHref(query)}
        retryAfterSeconds={result.status === 'unavailable' ? result.retryAfterSeconds : undefined}
      />
    );
  }
  const { items, pagination } = result.value;

  if (pagination.total === 0 && !isFilteredBookQuery(query)) {
    return (
      <EmptyState
        icon={LibraryBig}
        title="Your library is empty"
        description="Add your first book: a physical book you own or an ebook. You can add copies, locations and groups afterwards."
        action={{ href: '/library/new', label: 'Add your first book' }}
      />
    );
  }
  if (pagination.total === 0) {
    return (
      <EmptyState
        icon={SearchX}
        title="No books match"
        description="Search matches whole words in titles and authors. Try fewer or different words, or another format."
        action={{ href: '/library', label: 'Clear search and filters' }}
      />
    );
  }
  if (items.length === 0) {
    return (
      <EmptyState
        icon={SearchX}
        title="There are no books on this page"
        description={`The list has ${pagination.totalPages} page(s).`}
        action={{ href: libraryHref(query, 1) as Route, label: 'Go to the first page' }}
      />
    );
  }

  return (
    <>
      <p className="mb-3 text-sm text-ink-muted" aria-live="polite">
        {pagination.total} {pagination.total === 1 ? 'book' : 'books'}
        {isFilteredBookQuery(query) ? ' match' : ' in your library'}
        {isFilteredBookQuery(query) ? (
          <>
            {' · '}
            <Link href="/library" className="text-accent underline underline-offset-4">
              Clear
            </Link>
          </>
        ) : null}
      </p>
      <ul className="flex flex-col gap-3">
        {items.map((book) => (
          <li key={book.id}>
            <BookSummary book={book} />
          </li>
        ))}
      </ul>
      <Pagination
        pagination={pagination}
        noun="books"
        hrefFor={(page) => libraryHref(query, page)}
      />
    </>
  );
}
