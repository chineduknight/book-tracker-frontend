import Link from 'next/link';
import type { Route } from 'next';
import { notFound } from 'next/navigation';
import { Layers, Tags } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { SectionHeader } from '@/components/ui/section-header';
import { hrefWithQuery, parsePage, type SearchParams } from '@/lib/library/queries';
import type { GroupKind } from '@/lib/library/rules';
import {
  getGroup,
  listAllGroupBookIds,
  listCategoryPresets,
  listGroupBooks,
  listGroups,
} from '@/server/library/library-api';
import { loadAsReader } from '@/server/library/reader-data';
import { BookSummary } from './book-summary';
import { DataUnavailable } from './data-unavailable';
import { DeleteButton } from './delete-button';
import { GroupDetailsEditor } from './group-details-editor';
import { GroupBookAdder, RemoveFromGroupButton } from './group-membership';
import { LibraryBreadcrumb } from './library-breadcrumb';
import { Notice } from './notice';
import { NamedItemForm } from './named-item-form';
import { Pagination } from './pagination';

const COPY: Record<
  GroupKind,
  { title: string; one: string; description: string; empty: string; icon: typeof Tags }
> = {
  categories: {
    title: 'Categories',
    one: 'category',
    description: 'Classify books by subject or type, such as Philosophy or Fiction.',
    empty: 'Create categories by subject, then add books to them from here or from a book’s page.',
    icon: Tags,
  },
  collections: {
    title: 'Collections',
    one: 'collection',
    description: 'Your own lists of books, such as “To Read in 2027” or “Books for Isioma”.',
    empty: 'Create a collection, then add books to it from here or from a book’s page.',
    icon: Layers,
  },
};

/** The list of a reader's categories or collections, with creation. */
export async function GroupListPage({
  kind,
  searchParams,
}: {
  kind: GroupKind;
  searchParams: SearchParams;
}) {
  const page = parsePage(searchParams);
  const copy = COPY[kind];
  const pageHref = (target: number) =>
    hrefWithQuery(`/library/${kind}`, { page: target }, { page: 1 });
  const result = await loadAsReader(async (api) => ({
    groups: await listGroups(api, kind, page),
    presets: kind === 'categories' ? await listCategoryPresets(api) : [],
  }));

  return (
    <>
      <PageHeader
        title={copy.title}
        description={copy.description}
        before={<LibraryBreadcrumb />}
      />
      <Notice notice={searchParams.notice} />
      <section aria-labelledby={`add-${kind}`} className="mb-10">
        <SectionHeader id={`add-${kind}`} title={`Add a ${copy.one}`} />
        <Card>
          <NamedItemForm
            noun={copy.one}
            path={`/api/library/${kind}`}
            suggestions={result.status === 'ok' ? result.value.presets : []}
          />
        </Card>
      </section>
      <section aria-labelledby={`your-${kind}`}>
        <SectionHeader id={`your-${kind}`} title={`Your ${copy.title.toLowerCase()}`} />
        {result.status !== 'ok' ? (
          <DataUnavailable what={copy.title.toLowerCase()} retryHref={pageHref(page)} />
        ) : result.value.groups.pagination.total === 0 ? (
          <EmptyState
            icon={copy.icon}
            title={`No ${copy.title.toLowerCase()} yet`}
            description={copy.empty}
          />
        ) : (
          <>
            <ul className="flex flex-col gap-3">
              {result.value.groups.items.map((group) => (
                <li key={group.id} className="rounded-xl border border-line bg-surface p-4">
                  <Link
                    href={`/library/${kind}/${group.id}` as Route}
                    className="font-serif text-lg font-semibold break-words text-ink hover:text-accent"
                  >
                    {group.name}
                  </Link>
                  {group.description ? (
                    <p className="mt-1 text-sm break-words text-ink-muted">{group.description}</p>
                  ) : null}
                </li>
              ))}
            </ul>
            <Pagination
              pagination={result.value.groups.pagination}
              noun={copy.title.toLowerCase()}
              hrefFor={pageHref}
            />
          </>
        )}
      </section>
    </>
  );
}

/** One category or collection: its details and its books in membership order. */
export async function GroupDetailPage({
  kind,
  groupId,
  searchParams,
}: {
  kind: GroupKind;
  groupId: string;
  searchParams: SearchParams;
}) {
  const page = parsePage(searchParams);
  const copy = COPY[kind];
  const pageHref = (target: number) =>
    hrefWithQuery(`/library/${kind}/${groupId}`, { page: target }, { page: 1 });
  const result = await loadAsReader(async (api) => {
    const group = await getGroup(api, kind, groupId);
    const [books, memberIds] = await Promise.all([
      listGroupBooks(api, kind, group.id, page),
      listAllGroupBookIds(api, kind, group.id),
    ]);
    return { group, books, memberIds };
  });
  const back = <LibraryBreadcrumb href={`/library/${kind}`} label={copy.title} />;

  if (result.status === 'not-found') notFound();
  if (result.status === 'unavailable') {
    return (
      <>
        <PageHeader title={copy.title} before={back} />
        <DataUnavailable what={copy.one} retryHref={pageHref(page)} />
      </>
    );
  }

  const { group, books, memberIds } = result.value;
  return (
    <>
      <PageHeader title={group.name} description={group.description} before={back} />
      <div className="mb-8 flex flex-wrap gap-3">
        <GroupDetailsEditor kind={kind} noun={copy.one} group={group} />
        <DeleteButton
          path={`/api/library/${kind}/${group.id}`}
          label={`Delete ${copy.one}`}
          title={`Delete “${group.name}”?`}
          redirectTo={`/library/${kind}?notice=group-deleted`}
        >
          The {copy.one} disappears, but its books stay in your library, untouched. There is no way
          to restore it from here.
        </DeleteButton>
      </div>

      <section aria-labelledby="group-books" className="mb-10">
        <SectionHeader id="group-books" title="Books" description="In the order they were added." />
        {books.pagination.total === 0 ? (
          <EmptyState
            icon={copy.icon}
            title={`This ${copy.one} is empty`}
            description="Add books below."
            headingLevel="h3"
          />
        ) : (
          <>
            <ul className="flex flex-col gap-3">
              {books.items.map((book) => (
                <li key={book.id}>
                  <BookSummary
                    book={book}
                    actions={<RemoveFromGroupButton kind={kind} groupId={group.id} book={book} />}
                  />
                </li>
              ))}
            </ul>
            <Pagination pagination={books.pagination} noun="books" hrefFor={pageHref} />
          </>
        )}
      </section>

      <section aria-labelledby="group-add">
        <SectionHeader id="group-add" title={`Add books to this ${copy.one}`} />
        <Card>
          <GroupBookAdder kind={kind} noun={copy.one} groupId={group.id} memberIds={memberIds} />
        </Card>
      </section>
    </>
  );
}
