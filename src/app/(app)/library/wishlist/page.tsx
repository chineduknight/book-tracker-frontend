import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { Heart, Plus, SearchX } from 'lucide-react';
import { DataUnavailable } from '@/components/library/data-unavailable';
import { LibraryBreadcrumb } from '@/components/library/library-breadcrumb';
import { Notice } from '@/components/library/notice';
import { Pagination } from '@/components/library/pagination';
import { WishStatusBadges } from '@/components/library/wish-status';
import { ButtonLink } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { findLibrarySection } from '@/config/navigation';
import {
  hrefWithQuery,
  parseWishlistQuery,
  WISHLIST_QUERY_DEFAULTS,
  type WishlistQuery,
} from '@/lib/library/queries';
import {
  LIMITS,
  PRIORITY_LABELS,
  SORT_LABELS,
  WISHLIST_PRIORITIES,
  WISHLIST_SORTS,
} from '@/lib/library/rules';
import { requireSignedInProfile } from '@/server/current-session';
import { listWishlist } from '@/server/library/library-api';
import { loadAsReader } from '@/server/library/reader-data';

export const metadata: Metadata = { title: 'Wishlist' };

const STATUS_LABELS = { wanted: 'Still wanted', acquired: 'Acquired', all: 'All' } as const;

function wishlistHref(query: WishlistQuery, page = query.page): string {
  return hrefWithQuery(
    '/library/wishlist',
    { status: query.status, priority: query.priority, q: query.q, sort: query.sort, page },
    WISHLIST_QUERY_DEFAULTS,
  );
}

export default async function WishlistPage({ searchParams }: PageProps<'/library/wishlist'>) {
  await requireSignedInProfile();
  const params = await searchParams;
  const query = parseWishlistQuery(params);
  const result = await loadAsReader((api) => listWishlist(api, query));
  const { label, summary } = findLibrarySection('/library/wishlist');
  const isFiltered =
    query.q !== undefined || query.priority !== undefined || query.status !== 'wanted';
  const fieldClass =
    'min-h-11 rounded-lg border border-line-strong bg-surface px-3 text-base text-ink';

  return (
    <>
      <PageHeader
        title={label}
        description={`${summary} Wishes are not part of your catalogue and never count as owned books.`}
        before={<LibraryBreadcrumb />}
      />
      <Notice notice={params.notice} />
      <div className="mb-6">
        <ButtonLink href="/library/wishlist/new">
          <Plus aria-hidden="true" className="size-4" />
          Add a wish
        </ButtonLink>
      </div>

      <form
        method="get"
        action="/library/wishlist"
        role="search"
        aria-label="Filter your wishlist"
        className="mb-6 grid gap-3 rounded-xl border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto] lg:items-end"
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="wish-q" className="text-sm font-medium text-ink">
            Search titles, authors and notes
          </label>
          <input
            id="wish-q"
            name="q"
            type="search"
            maxLength={LIMITS.search}
            defaultValue={query.q ?? ''}
            className={fieldClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="wish-status" className="text-sm font-medium text-ink">
            Status
          </label>
          <select id="wish-status" name="status" defaultValue={query.status} className={fieldClass}>
            {Object.entries(STATUS_LABELS).map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="wish-priority" className="text-sm font-medium text-ink">
            Priority
          </label>
          <select
            id="wish-priority"
            name="priority"
            defaultValue={query.priority ?? ''}
            className={fieldClass}
          >
            <option value="">Any priority</option>
            {WISHLIST_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {PRIORITY_LABELS[priority]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="wish-sort" className="text-sm font-medium text-ink">
            Sort
          </label>
          <select id="wish-sort" name="sort" defaultValue={query.sort} className={fieldClass}>
            {WISHLIST_SORTS.map((sort) => (
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

      {result.status !== 'ok' ? (
        <DataUnavailable what="wishlist" retryHref={wishlistHref(query)} />
      ) : result.value.pagination.total === 0 ? (
        isFiltered ? (
          <EmptyState
            icon={SearchX}
            title="No wishes match"
            description="Try other words, another priority or status “All”."
            action={{ href: '/library/wishlist', label: 'Clear filters' }}
          />
        ) : (
          <EmptyState
            icon={Heart}
            title="Your wishlist is empty"
            description="Note books you would like to own. When you get one, add it to your library and mark the wish acquired."
            action={{ href: '/library/wishlist/new', label: 'Add a wish' }}
          />
        )
      ) : result.value.items.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="There are no wishes on this page"
          action={{ href: wishlistHref(query, 1) as Route, label: 'Go to the first page' }}
          description={`The list has ${result.value.pagination.totalPages} page(s).`}
        />
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {result.value.items.map((wish) => (
              <li key={wish.id} className="rounded-xl border border-line bg-surface p-4">
                <Link
                  href={`/library/wishlist/${wish.id}` as Route}
                  className="font-serif text-lg font-semibold break-words text-ink hover:text-accent"
                >
                  {wish.title}
                </Link>
                {wish.authors.length > 0 ? (
                  <p className="text-sm break-words text-ink-muted">{wish.authors.join(', ')}</p>
                ) : null}
                <WishStatusBadges wish={wish} />
              </li>
            ))}
          </ul>
          <Pagination
            pagination={result.value.pagination}
            noun="wishes"
            hrefFor={(page) => wishlistHref(query, page)}
          />
        </>
      )}
    </>
  );
}
