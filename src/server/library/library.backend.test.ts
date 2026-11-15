// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { NextRequest } from 'next/server';
import { beforeAll, describe, expect, inject, it } from 'vitest';
import { createApiClient, type ApiClient } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { createMemorySessionStore } from '@/test/fixtures/memory-session-store';
import { createBackendAuth } from '../auth/backend-auth';
import { handleLibraryOperation } from '../http/library-route';
import { createSessionService } from '../session/session-service';
import type { BffRuntime } from '../session/session-runtime';
import { createTokenVault } from '../session/token-vault';
import * as library from './library-api';
import { createBook, groupOperations, searchBooks } from './library-operations';

/*
 * Contract tests against the real, merged API: every response also passes through the BFF's own
 * DTO schemas, so a drift between this app and the API fails here.
 */
const apiBaseUrl = inject('apiBaseUrl');
const backendAuth = createBackendAuth({ apiBaseUrl });

async function newReader() {
  const signedIn = await backendAuth.register({
    name: 'Contract Reader',
    email: `contract-${randomBytes(6).toString('hex')}@example.test`,
    password: 'contract test passphrase',
  });
  const api = createApiClient({
    baseUrl: apiBaseUrl,
    getAccessToken: () => signedIn.tokens.accessToken,
  });
  return { signedIn, api };
}

async function apiError(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}

let alice: ApiClient;
let bob: ApiClient;
let aliceSession: Awaited<ReturnType<typeof newReader>>['signedIn'];

beforeAll(async () => {
  const a = await newReader();
  const b = await newReader();
  alice = a.api;
  aliceSession = a.signedIn;
  bob = b.api;
});

describe('books', () => {
  it('create, read, edit with nulls, search, filter, delete', async () => {
    const created = await library.createBook(alice, {
      title: 'The   Mill on the Floss',
      authors: ['George Eliot'],
      format: 'physical',
      isbn: '978-0-14-143962-1',
      pageCount: 600,
    });
    expect(created).toMatchObject({
      title: 'The Mill on the Floss',
      format: 'physical',
      pageCount: 600,
    });
    expect(created).not.toHaveProperty('readingStatus');
    expect(created).not.toHaveProperty('copyCount');

    const edited = await library.updateBook(alice, created.id, {
      isbn: null,
      authors: [],
      pageCount: null,
    });
    expect(edited.authors).toEqual([]);
    expect(edited).not.toHaveProperty('isbn');
    expect(edited).not.toHaveProperty('pageCount');

    await library.createBook(alice, { title: 'Silas Marner', format: 'ebook' });
    const byWord = await library.listBooks(alice, { q: 'floss', sort: 'recent', page: 1 });
    expect(byWord.items.map((book) => book.title)).toEqual(['The Mill on the Floss']);
    const prefix = await library.listBooks(alice, { q: 'flo', sort: 'recent', page: 1 });
    expect(prefix.pagination.total).toBe(0);
    const ebooks = await library.listBooks(alice, { format: 'ebook', sort: 'title_asc', page: 1 });
    expect(ebooks.items.map((book) => book.title)).toEqual(['Silas Marner']);

    const duplicates = await library.findDuplicateBooks(alice, { title: 'the mill on the floss' });
    expect(duplicates.map((match) => match.book.id)).toEqual([created.id]);

    await expect(library.deleteBook(alice, created.id)).resolves.toBeUndefined();
    expect((await apiError(library.getBook(alice, created.id))).status).toBe(404);
  });

  it('paginates with real totals, and a page past the end is empty, not an error', async () => {
    const { api } = await newReader();
    for (let index = 0; index < 21; index += 1) {
      await library.createBook(api, {
        title: `Volume ${String(index).padStart(2, '0')}`,
        format: 'ebook',
      });
    }
    const first = await library.listBooks(api, { sort: 'title_asc', page: 1 });
    expect(first.pagination).toEqual({ page: 1, limit: 20, total: 21, totalPages: 2 });
    const second = await library.listBooks(api, { sort: 'title_asc', page: 2 });
    expect(second.items.map((book) => book.title)).toEqual(['Volume 20']);
    const beyond = await library.listBooks(api, { sort: 'title_asc', page: 9 });
    expect(beyond.items).toEqual([]);
    expect(beyond.pagination.total).toBe(21);
  });
});

describe('copies and locations', () => {
  it('assigns, unassigns and soft-deletes copies; ebooks have none; history blocks the format change', async () => {
    const shelf = await library.createLocation(alice, {
      name: 'Study  Shelf',
      description: 'By the window',
    });
    expect(shelf.name).toBe('Study Shelf');
    expect((await apiError(library.createLocation(alice, { name: 'study shelf' }))).status).toBe(
      409,
    );
    await library.updateLocation(alice, shelf.id, { description: null });

    const book = await library.createBook(alice, { title: 'Adam Bede', format: 'physical' });
    const copy = await library.createCopy(alice, book.id, {
      label: 'Paperback',
      condition: 'good',
      locationId: shelf.id,
    });
    expect(copy).toMatchObject({ locationId: shelf.id, condition: 'good', label: 'Paperback' });
    const unassigned = await library.updateCopy(alice, copy.id, {
      locationId: null,
      condition: null,
    });
    expect(unassigned.locationId).toBeNull();
    expect(unassigned).not.toHaveProperty('condition');

    const ebook = await library.createBook(alice, { title: 'Romola', format: 'ebook' });
    expect((await apiError(library.createCopy(alice, ebook.id, {}))).code).toBe(
      'BOOK_NOT_PHYSICAL',
    );

    await expect(library.deleteCopy(alice, copy.id)).resolves.toBeUndefined();
    expect((await library.listCopies(alice, book.id, 1)).pagination.total).toBe(0);
    const formatChange = await apiError(library.updateBook(alice, book.id, { format: 'ebook' }));
    expect(formatChange).toMatchObject({ status: 409, code: 'BOOK_HAS_PHYSICAL_COPIES' });
  });

  it('lists every location for selectors, across pages', async () => {
    const { api } = await newReader();
    for (let index = 0; index < 23; index += 1)
      await library.createLocation(api, { name: `Shelf ${index}` });
    expect(await library.listAllLocations(api)).toHaveLength(23);
    expect((await library.listLocations(api, 2)).items).toHaveLength(3);
  });
});

describe('categories and collections', () => {
  it('presets are only suggestions; memberships keep insertion order; deleting a group keeps its books', async () => {
    const presets = await library.listCategoryPresets(alice);
    expect(presets).toContain('Philosophy');
    expect((await library.listGroups(alice, 'categories', 1)).pagination.total).toBe(0);

    const category = await library.createGroup(alice, 'categories', { name: 'Philosophy' });
    const collection = await library.createGroup(alice, 'collections', { name: 'Philosophy' });
    expect(collection.name).toBe('Philosophy');
    expect(
      (await apiError(library.createGroup(alice, 'categories', { name: 'philosophy' }))).status,
    ).toBe(409);

    const first = await library.createBook(alice, { title: 'Ethics', format: 'ebook' });
    const second = await library.createBook(alice, { title: 'Meditations', format: 'ebook' });
    await library.addBookToGroup(alice, 'categories', category.id, second.id);
    await library.addBookToGroup(alice, 'categories', category.id, first.id);
    await library.addBookToGroup(alice, 'categories', category.id, second.id);
    const members = await library.listGroupBooks(alice, 'categories', category.id, 1);
    expect(members.items.map((book) => book.title)).toEqual(['Meditations', 'Ethics']);

    const organization = await library.getBookOrganization(alice, first.id);
    expect(organization.categories.map((group) => group.id)).toEqual([category.id]);
    expect(organization.collections).toEqual([]);

    await library.removeBookFromGroup(alice, 'categories', category.id, first.id);
    await library.removeBookFromGroup(alice, 'categories', category.id, first.id);
    await library.deleteGroup(alice, 'categories', category.id);
    expect((await apiError(library.getGroup(alice, 'categories', category.id))).status).toBe(404);
    await expect(library.getBook(alice, second.id)).resolves.toMatchObject({
      title: 'Meditations',
    });
  });
});

describe('wishlist', () => {
  it('stays out of the catalogue and is acquired once, against an existing book', async () => {
    const { api } = await newReader();
    const wish = await library.createWish(api, { title: 'Daniel Deronda' });
    expect(wish).toMatchObject({
      status: 'wanted',
      priority: 'medium',
      acquiredBookId: null,
      authors: [],
    });
    expect((await library.listBooks(api, { sort: 'recent', page: 1 })).pagination.total).toBe(0);

    const book = await library.createBook(api, { title: 'Daniel Deronda', format: 'physical' });
    const other = await library.createBook(api, { title: 'Felix Holt', format: 'ebook' });
    const acquired = await library.acquireWish(api, wish.id, book.id);
    expect(acquired).toMatchObject({ status: 'acquired', acquiredBookId: book.id });
    await expect(library.acquireWish(api, wish.id, book.id)).resolves.toMatchObject({
      acquiredAt: acquired.acquiredAt,
    });
    expect((await apiError(library.acquireWish(api, wish.id, other.id))).code).toBe(
      'WISHLIST_ALREADY_ACQUIRED',
    );

    expect(
      (await library.listWishlist(api, { status: 'wanted', sort: 'recent', page: 1 })).pagination
        .total,
    ).toBe(0);
    expect(
      (await library.listWishlist(api, { status: 'all', sort: 'recent', page: 1 })).pagination
        .total,
    ).toBe(1);

    await library.deleteBook(api, book.id);
    const afterDeletion = await library.getWish(api, wish.id);
    expect(afterDeletion).toMatchObject({ status: 'acquired', acquiredBookId: book.id });
    expect((await apiError(library.getBook(api, book.id))).status).toBe(404);

    const cleared = await library.updateWish(api, wish.id, {
      note: 'Annotated edition',
      priority: 'high',
    });
    expect(cleared).toMatchObject({
      note: 'Annotated edition',
      priority: 'high',
      status: 'acquired',
    });
  });
});

describe('reader isolation', () => {
  it('another reader sees 404 for every foreign record, never its contents', async () => {
    const book = await library.createBook(alice, { title: 'Private Book', format: 'physical' });
    const copy = await library.createCopy(alice, book.id, {});
    const location = await library.createLocation(alice, {
      name: `Private ${randomBytes(3).toString('hex')}`,
    });
    const category = await library.createGroup(alice, 'categories', {
      name: `Private ${randomBytes(3).toString('hex')}`,
    });
    const wish = await library.createWish(alice, { title: 'Private Wish' });

    const attempts: Array<() => Promise<unknown>> = [
      () => library.getBook(bob, book.id),
      () => library.updateBook(bob, book.id, { title: 'Stolen' }),
      () => library.deleteBook(bob, book.id),
      () => library.listCopies(bob, book.id, 1),
      () => library.updateCopy(bob, copy.id, { label: 'Stolen' }),
      () => library.deleteCopy(bob, copy.id),
      () => library.updateLocation(bob, location.id, { name: 'Stolen' }),
      () => library.getGroup(bob, 'categories', category.id),
      () => library.listGroupBooks(bob, 'categories', category.id, 1),
      () => library.getWish(bob, wish.id),
      () => library.acquireWish(bob, wish.id, book.id),
      () => library.getBookOrganization(bob, book.id),
    ];
    for (const attempt of attempts) {
      expect((await apiError(attempt())).status).toBe(404);
    }
    expect(
      (await library.listBooks(bob, { sort: 'recent', page: 1 })).items.some(
        (b) => b.id === book.id,
      ),
    ).toBe(false);
    await expect(library.getBook(alice, book.id)).resolves.toMatchObject({ title: 'Private Book' });
  });
});

describe('through the BFF route pipeline', () => {
  const ORIGIN = 'https://avuneri.example';
  let runtime: BffRuntime;
  let cookie: string;

  beforeAll(async () => {
    const sessions = createSessionService({
      store: createMemorySessionStore(),
      backend: backendAuth,
      vault: createTokenVault(randomBytes(32)),
    });
    runtime = {
      config: {
        apiBaseUrl,
        appOrigin: ORIGIN,
        isHttps: true,
        sessionStore: {
          uri: 'mongodb://127.0.0.1/unused',
          databaseName: 'unused',
          requiresTls: false,
        },
        sessionMasterKey: randomBytes(32),
      },
      sessions,
      backend: backendAuth,
    };
    cookie = (await sessions.startSession(aliceSession, new Date())).sessionSecret;
  });

  function request(method: string, body?: unknown, search = '') {
    return new NextRequest(`${ORIGIN}/api/library/x${search}`, {
      method,
      headers: {
        cookie: `__Host-avuneri_session=${cookie}`,
        ...(method === 'GET' ? {} : { origin: ORIGIN, 'sec-fetch-site': 'same-origin' }),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  it('creates a book, adds it to a collection with a real 204, and finds it', async () => {
    const created = await handleLibraryOperation(
      request('POST', { title: 'Scenes of Clerical Life', format: 'ebook' }),
      runtime,
      {},
      'POST',
      createBook,
    );
    expect(created.status).toBe(201);
    const { data: book } = await created.json();

    const collection = await library.createGroup(alice, 'collections', {
      name: `Pipeline ${randomBytes(3).toString('hex')}`,
    });
    const added = await handleLibraryOperation(
      request('PUT'),
      runtime,
      { groupId: collection.id, bookId: book.id },
      'PUT',
      groupOperations('collections').addBook,
    );
    expect(added.status).toBe(204);
    expect(await added.text()).toBe('');

    const found = await handleLibraryOperation(
      request('GET', undefined, '?q=clerical'),
      runtime,
      {},
      'GET',
      searchBooks,
    );
    expect((await found.json()).data.items.map((item: { id: string }) => item.id)).toContain(
      book.id,
    );
  });
});
