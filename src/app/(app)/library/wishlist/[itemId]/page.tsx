import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError } from '@/lib/api/errors';
import { DataUnavailable } from '@/components/library/data-unavailable';
import { DeleteButton } from '@/components/library/delete-button';
import { ExternalLink } from '@/components/library/external-link';
import { LibraryBreadcrumb } from '@/components/library/library-breadcrumb';
import { Notice } from '@/components/library/notice';
import { AcquireWish, WishEditor } from '@/components/library/wish-actions';
import { WishStatusBadges } from '@/components/library/wish-status';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { SectionHeader } from '@/components/ui/section-header';
import type { Book } from '@/lib/library/types';
import { requireSignedInProfile } from '@/server/current-session';
import { getBook, getWish } from '@/server/library/library-api';
import { loadAsReader } from '@/server/library/reader-data';

export const metadata: Metadata = { title: 'Wish' };

export default async function WishPage({
  params,
  searchParams,
}: PageProps<'/library/wishlist/[itemId]'>) {
  await requireSignedInProfile();
  const { itemId } = await params;
  const { notice } = await searchParams;
  const result = await loadAsReader(async (api) => {
    const wish = await getWish(api, itemId);
    let acquiredBook: Book | 'deleted' | null = null;
    if (wish.acquiredBookId) {
      // The linked book may have been deleted since: resolve it before offering a link.
      acquiredBook = await getBook(api, wish.acquiredBookId).catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 404) return 'deleted' as const;
        throw error;
      });
    }
    return { wish, acquiredBook };
  });
  const back = <LibraryBreadcrumb href="/library/wishlist" label="Wishlist" />;

  if (result.status === 'not-found') notFound();
  if (result.status === 'unavailable') {
    return (
      <>
        <PageHeader title="Wish" before={back} />
        <DataUnavailable what="wish" retryHref={`/library/wishlist/${itemId}`} />
      </>
    );
  }

  const { wish, acquiredBook } = result.value;
  return (
    <>
      <PageHeader
        title={wish.title}
        description={wish.authors.length > 0 ? wish.authors.join(', ') : undefined}
        before={back}
      />
      <Notice notice={notice} />
      <Card className="mb-8">
        <WishStatusBadges wish={wish} />
        <dl className="mt-4 grid gap-2 text-sm">
          {wish.isbn ? (
            <div className="flex gap-2">
              <dt className="text-ink-muted">ISBN</dt>
              <dd className="font-medium break-all">{wish.isbn}</dd>
            </div>
          ) : null}
          {wish.sourceUrl ? (
            <div className="flex gap-2">
              <dt className="text-ink-muted">Where to find it</dt>
              <dd>
                <ExternalLink href={wish.sourceUrl}>Open link</ExternalLink>
              </dd>
            </div>
          ) : null}
          {wish.coverUrl ? (
            <div className="flex gap-2">
              <dt className="text-ink-muted">Cover</dt>
              <dd>
                <ExternalLink href={wish.coverUrl}>Cover image</ExternalLink>
              </dd>
            </div>
          ) : null}
        </dl>
        {wish.note ? (
          <p className="mt-4 max-w-prose text-sm break-words whitespace-pre-line">{wish.note}</p>
        ) : null}
      </Card>

      <div className="mb-10 flex flex-wrap gap-3">
        <WishEditor wish={wish} />
        <DeleteButton
          path={`/api/library/wishlist/${wish.id}`}
          label="Delete wish"
          title={`Delete “${wish.title}”?`}
          redirectTo="/library/wishlist?notice=wish-deleted"
        >
          The wish disappears from your wishlist. Books in your library are not affected. There is
          no way to restore it from here.
        </DeleteButton>
      </div>

      <section aria-labelledby="acquisition">
        <SectionHeader id="acquisition" title="Acquisition" />
        {wish.status === 'acquired' ? (
          <p className="text-sm">
            Acquired
            {wish.acquiredAt
              ? ` on ${new Date(wish.acquiredAt).toLocaleDateString('en-GB', { dateStyle: 'long' })}`
              : ''}
            {acquiredBook && acquiredBook !== 'deleted' ? (
              <>
                {' as '}
                <Link
                  href={`/library/books/${acquiredBook.id}` as Route}
                  className="font-medium text-accent underline underline-offset-4"
                >
                  {acquiredBook.title}
                </Link>
                .
              </>
            ) : (
              '. The linked book is no longer in your library.'
            )}
          </p>
        ) : (
          <Card>
            <AcquireWish wish={wish} />
          </Card>
        )}
      </section>
    </>
  );
}
