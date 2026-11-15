import 'server-only';
import type { z } from 'zod';
import type { ApiClient } from '@/lib/api/client';
import type { Page } from '@/lib/api/contract';
import { apiPath, type ApiPath } from '@/lib/api/path';
import type { BookListQuery, WishlistQuery } from '@/lib/library/queries';
import { PAGE_SIZE, type GroupKind } from '@/lib/library/rules';
import type {
  Book,
  BookOrganization,
  DuplicateSuggestion,
  Group,
  PhysicalCopy,
  StorageLocation,
  WishlistItem,
} from '@/lib/library/types';
import {
  bookSchema,
  copySchema,
  duplicateMatchesSchema,
  namedSchema,
  organizationSchema,
  presetsSchema,
  wishSchema,
  type CreateBook,
  type CreateCopy,
  type CreateNamed,
  type CreateWish,
  type UpdateBook,
  type UpdateCopy,
  type UpdateNamed,
  type UpdateWish,
} from './library-schemas';

/*
 * One function per API operation, each calling exactly one documented endpoint with an allowlisted
 * query and validating the response. Callers obtain the ApiClient from the reader's session
 * (reader-api.ts); nothing here knows about cookies or tokens.
 */
const parseWith =
  <T>(schema: z.ZodType<T>) =>
  (data: unknown): T =>
    schema.parse(data);

/** Safety cap when a selector needs every location or group: 50 pages of 100. */
const MAX_PAGES_FOR_SELECTORS = 50;

async function everyPage<T>(load: (page: number) => Promise<Page<T>>): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; page <= MAX_PAGES_FOR_SELECTORS; page += 1) {
    const result = await load(page);
    items.push(...result.items);
    if (page >= result.pagination.totalPages) break;
  }
  return items;
}

// Books

export function listBooks(api: ApiClient, query: BookListQuery): Promise<Page<Book>> {
  return api.getPage(apiPath`/books`, {
    query: {
      page: query.page,
      limit: PAGE_SIZE,
      q: query.q,
      format: query.format,
      sort: query.sort,
    },
    parse: parseWith(bookSchema),
  });
}

export function getBook(api: ApiClient, bookId: string): Promise<Book> {
  return api.get(apiPath`/books/${bookId}`, { parse: parseWith(bookSchema) });
}

export function createBook(api: ApiClient, book: CreateBook): Promise<Book> {
  return api.post(apiPath`/books`, { body: book, parse: parseWith(bookSchema) });
}

export function updateBook(api: ApiClient, bookId: string, changes: UpdateBook): Promise<Book> {
  return api.patch(apiPath`/books/${bookId}`, { body: changes, parse: parseWith(bookSchema) });
}

export function deleteBook(api: ApiClient, bookId: string): Promise<void> {
  return api.delete(apiPath`/books/${bookId}`);
}

export async function findDuplicateBooks(
  api: ApiClient,
  candidate: { title?: string | undefined; isbn?: string | undefined },
): Promise<DuplicateSuggestion[]> {
  const { matches } = await api.get(apiPath`/books/duplicate-check`, {
    query: { title: candidate.title, isbn: candidate.isbn },
    parse: parseWith(duplicateMatchesSchema),
  });
  return matches;
}

export function getBookOrganization(api: ApiClient, bookId: string): Promise<BookOrganization> {
  return api.get(apiPath`/books/${bookId}/organization`, { parse: parseWith(organizationSchema) });
}

// Physical copies

export function listCopies(
  api: ApiClient,
  bookId: string,
  page: number,
): Promise<Page<PhysicalCopy>> {
  return api.getPage(apiPath`/books/${bookId}/copies`, {
    query: { page, limit: 100 },
    parse: parseWith(copySchema),
  });
}

export function createCopy(
  api: ApiClient,
  bookId: string,
  copy: CreateCopy,
): Promise<PhysicalCopy> {
  return api.post(apiPath`/books/${bookId}/copies`, { body: copy, parse: parseWith(copySchema) });
}

export function updateCopy(
  api: ApiClient,
  copyId: string,
  changes: UpdateCopy,
): Promise<PhysicalCopy> {
  return api.patch(apiPath`/copies/${copyId}`, { body: changes, parse: parseWith(copySchema) });
}

export function deleteCopy(api: ApiClient, copyId: string): Promise<void> {
  return api.delete(apiPath`/copies/${copyId}`);
}

// Storage locations (the API has no delete endpoint)

export function listLocations(api: ApiClient, page: number): Promise<Page<StorageLocation>> {
  return api.getPage(apiPath`/locations`, {
    query: { page, limit: PAGE_SIZE },
    parse: parseWith(namedSchema),
  });
}

export function listAllLocations(api: ApiClient): Promise<StorageLocation[]> {
  return everyPage((page) =>
    api.getPage(apiPath`/locations`, {
      query: { page, limit: 100 },
      parse: parseWith(namedSchema),
    }),
  );
}

export function createLocation(api: ApiClient, location: CreateNamed): Promise<StorageLocation> {
  return api.post(apiPath`/locations`, { body: location, parse: parseWith(namedSchema) });
}

export function updateLocation(
  api: ApiClient,
  locationId: string,
  changes: UpdateNamed,
): Promise<StorageLocation> {
  return api.patch(apiPath`/locations/${locationId}`, {
    body: changes,
    parse: parseWith(namedSchema),
  });
}

// Categories and collections

function groupPath(kind: GroupKind, groupId?: string): ApiPath {
  if (kind === 'categories')
    return groupId ? apiPath`/categories/${groupId}` : apiPath`/categories`;
  return groupId ? apiPath`/collections/${groupId}` : apiPath`/collections`;
}

function groupBooksPath(kind: GroupKind, groupId: string, bookId?: string): ApiPath {
  if (kind === 'categories') {
    return bookId
      ? apiPath`/categories/${groupId}/books/${bookId}`
      : apiPath`/categories/${groupId}/books`;
  }
  return bookId
    ? apiPath`/collections/${groupId}/books/${bookId}`
    : apiPath`/collections/${groupId}/books`;
}

export function listGroups(api: ApiClient, kind: GroupKind, page: number): Promise<Page<Group>> {
  return api.getPage(groupPath(kind), {
    query: { page, limit: PAGE_SIZE },
    parse: parseWith(namedSchema),
  });
}

export function listAllGroups(api: ApiClient, kind: GroupKind): Promise<Group[]> {
  return everyPage((page) =>
    api.getPage(groupPath(kind), { query: { page, limit: 100 }, parse: parseWith(namedSchema) }),
  );
}

export function getGroup(api: ApiClient, kind: GroupKind, groupId: string): Promise<Group> {
  return api.get(groupPath(kind, groupId), { parse: parseWith(namedSchema) });
}

export function createGroup(api: ApiClient, kind: GroupKind, group: CreateNamed): Promise<Group> {
  return api.post(groupPath(kind), { body: group, parse: parseWith(namedSchema) });
}

export function updateGroup(
  api: ApiClient,
  kind: GroupKind,
  groupId: string,
  changes: UpdateNamed,
): Promise<Group> {
  return api.patch(groupPath(kind, groupId), { body: changes, parse: parseWith(namedSchema) });
}

export function deleteGroup(api: ApiClient, kind: GroupKind, groupId: string): Promise<void> {
  return api.delete(groupPath(kind, groupId));
}

/** In membership order (the order books were first added); there is no reorder endpoint. */
export function listGroupBooks(
  api: ApiClient,
  kind: GroupKind,
  groupId: string,
  page: number,
): Promise<Page<Book>> {
  return api.getPage(groupBooksPath(kind, groupId), {
    query: { page, limit: PAGE_SIZE },
    parse: parseWith(bookSchema),
  });
}

/** Idempotent; the API answers 204 No Content. */
export async function addBookToGroup(
  api: ApiClient,
  kind: GroupKind,
  groupId: string,
  bookId: string,
): Promise<void> {
  await api.request({
    method: 'PUT',
    path: groupBooksPath(kind, groupId, bookId),
    expect: 'empty',
  });
}

/** Idempotent; the API answers 204 No Content. */
export function removeBookFromGroup(
  api: ApiClient,
  kind: GroupKind,
  groupId: string,
  bookId: string,
): Promise<void> {
  return api.delete(groupBooksPath(kind, groupId, bookId));
}

/** Suggested names only: nothing is created until the reader creates a category. */
export async function listCategoryPresets(api: ApiClient): Promise<string[]> {
  const { names } = await api.get(apiPath`/categories/presets`, {
    parse: parseWith(presetsSchema),
  });
  return names;
}

// Wishlist

export function listWishlist(api: ApiClient, query: WishlistQuery): Promise<Page<WishlistItem>> {
  return api.getPage(apiPath`/wishlist`, {
    query: {
      page: query.page,
      limit: PAGE_SIZE,
      status: query.status,
      priority: query.priority,
      q: query.q,
      sort: query.sort,
    },
    parse: parseWith(wishSchema),
  });
}

export function getWish(api: ApiClient, itemId: string): Promise<WishlistItem> {
  return api.get(apiPath`/wishlist/${itemId}`, { parse: parseWith(wishSchema) });
}

export function createWish(api: ApiClient, wish: CreateWish): Promise<WishlistItem> {
  return api.post(apiPath`/wishlist`, { body: wish, parse: parseWith(wishSchema) });
}

export function updateWish(
  api: ApiClient,
  itemId: string,
  changes: UpdateWish,
): Promise<WishlistItem> {
  return api.patch(apiPath`/wishlist/${itemId}`, { body: changes, parse: parseWith(wishSchema) });
}

export function deleteWish(api: ApiClient, itemId: string): Promise<void> {
  return api.delete(apiPath`/wishlist/${itemId}`);
}

/** Links the wish to an existing owned book. Final: the API has no way to undo it. */
export function acquireWish(api: ApiClient, itemId: string, bookId: string): Promise<WishlistItem> {
  return api.request({
    method: 'PUT',
    path: apiPath`/wishlist/${itemId}/acquisition`,
    body: { bookId },
    expect: 'data',
    parse: parseWith(wishSchema),
  }) as Promise<WishlistItem>;
}
