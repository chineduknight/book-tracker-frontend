// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeBackendAuth, type FakeBackendAuth } from '@/test/fixtures/fake-backend-auth';
import { errorResponse as apiError, fakeFetch, jsonResponse } from '@/test/fixtures/fetch';
import { createMemorySessionStore } from '@/test/fixtures/memory-session-store';
import type { BffConfig } from '../config';
import {
  acquireWish,
  createBook,
  deleteBook,
  groupOperations,
  searchBooks,
  updateBook,
} from '../library/library-operations';
import { createSessionService } from '../session/session-service';
import type { BffRuntime } from '../session/session-runtime';
import { createTokenVault } from '../session/token-vault';
import { handleLibraryOperation, type LibraryMethod, type LibraryOperation } from './library-route';

const ORIGIN = 'https://avuneri.example';
const API = 'https://api.avuneri.example/api/v1';
const BOOK_ID = '665f1c2ab4e5d1a2b3c4d5e6';
const GROUP_ID = '665f1c2ab4e5d1a2b3c4d5e7';
const NOW = '2026-11-15T10:00:00.000Z';
const BOOK = {
  id: BOOK_ID,
  title: 'Middlemarch',
  authors: ['George Eliot'],
  format: 'physical',
  createdAt: NOW,
  updatedAt: NOW,
};

let fake: FakeBackendAuth;
let runtime: BffRuntime;
let cookie: string;
let accessToken: string;

beforeEach(async () => {
  fake = createFakeBackendAuth();
  const config: BffConfig = {
    apiBaseUrl: API,
    appOrigin: ORIGIN,
    isHttps: true,
    sessionStore: { uri: 'mongodb://127.0.0.1/x', databaseName: 'x', requiresTls: false },
    sessionMasterKey: randomBytes(32),
  };
  const sessions = createSessionService({
    store: createMemorySessionStore(),
    backend: fake.backend,
    vault: createTokenVault(config.sessionMasterKey),
  });
  runtime = { config, sessions, backend: fake.backend };
  const signedIn = await fake.signUp();
  accessToken = signedIn.tokens.accessToken;
  cookie = (await sessions.startSession(signedIn, new Date())).sessionSecret;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function backend(...responses: Response[]) {
  const stub = fakeFetch(...responses);
  vi.stubGlobal('fetch', stub.fetchImpl);
  return stub;
}

function request(
  method: LibraryMethod,
  path: string,
  options: { body?: unknown; headers?: Record<string, string>; withCookie?: boolean } = {},
) {
  const { body, headers = {}, withCookie = true } = options;
  const hasBody = body !== undefined;
  return new NextRequest(`${ORIGIN}${path}`, {
    method,
    headers: {
      ...(method === 'GET' ? {} : { origin: ORIGIN, 'sec-fetch-site': 'same-origin' }),
      ...(hasBody ? { 'content-type': 'application/json' } : {}),
      ...(withCookie ? { cookie: `__Host-avuneri_session=${cookie}` } : {}),
      ...headers,
    },
    ...(hasBody ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  });
}

function run<Input, Result, IdName extends string>(
  method: LibraryMethod,
  operation: LibraryOperation<Input, Result, IdName>,
  req: NextRequest,
  params: Record<string, string> = {},
) {
  return handleLibraryOperation(req, runtime, params, method, operation);
}

describe('CSRF on every write method', () => {
  const cases: Array<[LibraryMethod, unknown, (req: NextRequest) => Promise<Response>]> = [
    ['POST', { title: 'Emma', format: 'ebook' }, (req) => run('POST', createBook, req)],
    ['PATCH', { title: 'Emma' }, (req) => run('PATCH', updateBook, req, { bookId: BOOK_ID })],
    ['DELETE', undefined, (req) => run('DELETE', deleteBook, req, { bookId: BOOK_ID })],
    [
      'PUT',
      undefined,
      (req) =>
        run('PUT', groupOperations('categories').addBook, req, {
          groupId: GROUP_ID,
          bookId: BOOK_ID,
        }),
    ],
  ];

  for (const [method, body, send] of cases) {
    it.each([
      ['a foreign origin', { origin: 'https://evil.example' }],
      ['a null origin', { origin: 'null' }],
      ['a cross-site fetch', { 'sec-fetch-site': 'cross-site' }],
    ])(`${method} refuses %s without calling the API`, async (_name, headers) => {
      const { fetchImpl } = backend();
      const response = await send(request(method, '/x', { body, headers }));
      expect(response.status).toBe(403);
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it(`${method} refuses a missing origin`, async () => {
      backend();
      const req = request(method, '/x', { body });
      req.headers.delete('origin');
      expect((await send(req)).status).toBe(403);
    });
  }
});

describe('request hygiene', () => {
  it('refuses a body on a request that takes none', async () => {
    backend();
    const response = await run('DELETE', deleteBook, request('DELETE', '/x', { body: { x: 1 } }), {
      bookId: BOOK_ID,
    });
    expect(response.status).toBe(400);
  });

  it('refuses non-JSON bodies and bodies over 32 KiB', async () => {
    backend();
    const text = await run(
      'POST',
      createBook,
      request('POST', '/x', { body: 'title=x', headers: { 'content-type': 'text/plain' } }),
    );
    expect(text.status).toBe(415);
    const huge = await run(
      'POST',
      createBook,
      request('POST', '/x', {
        body: { title: 'x', format: 'ebook', description: 'é'.repeat(20_000) },
      }),
    );
    expect(huge.status).toBe(413);
  });

  it('accepts the largest valid description in multibyte text', async () => {
    const { calls } = backend(jsonResponse(201, { data: BOOK }));
    const response = await run(
      'POST',
      createBook,
      request('POST', '/x', {
        body: { title: 'x', format: 'ebook', description: '😀'.repeat(2_500) },
      }),
    );
    expect(response.status).toBe(201);
    expect(calls()).toHaveLength(1);
  });

  it('validates ids before anything else', async () => {
    const { fetchImpl } = backend();
    const response = await run(
      'PATCH',
      updateBook,
      request('PATCH', '/x', { body: { title: 'x' } }),
      {
        bookId: '../../users',
      },
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.fields).toEqual([
      { field: 'bookId', message: 'must be a 24-character hexadecimal id' },
    ]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ['an unknown field', { title: 'x', ownerId: BOOK_ID }],
    ['an empty change', {}],
    ['a blank optional field', { edition: '   ' }],
    ['a non-http cover', { coverUrl: 'javascript:alert(1)' }],
    ['a null title', { title: null }],
  ])('refuses %s with field errors, never calling the API', async (_name, body) => {
    const { fetchImpl } = backend();
    const response = await run('PATCH', updateBook, request('PATCH', '/x', { body }), {
      bookId: BOOK_ID,
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('VALIDATION_ERROR');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('sessions', () => {
  it('requires a session cookie', async () => {
    backend();
    const response = await run('GET', searchBooks, request('GET', '/x', { withCookie: false }));
    expect(response.status).toBe(401);
  });

  it('ends the session and clears the cookie when the API says 401', async () => {
    backend(apiError(401, 'UNAUTHENTICATED', 'A valid access token is required'));
    const response = await run('GET', searchBooks, request('GET', '/x'));
    expect(response.status).toBe(401);
    expect(response.headers.get('set-cookie')).toMatch(/Max-Age=0/i);
    await expect(runtime.sessions.accessTokenFor(cookie)).rejects.toMatchObject({
      reason: 'missing',
    });
  });
});

describe('calling the API', () => {
  it('creates a book with exactly the validated body and the bearer token', async () => {
    const { calls } = backend(jsonResponse(201, { data: BOOK }));
    const response = await run(
      'POST',
      createBook,
      request('POST', '/x', { body: { title: '  Middle   march ', format: 'physical' } }),
    );

    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({ data: BOOK });
    const [call] = calls();
    expect(call?.url).toBe(`${API}/books`);
    expect(JSON.parse(String(call?.init.body))).toEqual({
      title: 'Middle march',
      format: 'physical',
    });
    expect(call?.headers.get('authorization')).toBe(`Bearer ${accessToken}`);
  });

  it('sends PATCH nulls through to clear fields and lowercases ids', async () => {
    const { calls } = backend(jsonResponse(200, { data: BOOK }));
    await run('PATCH', updateBook, request('PATCH', '/x', { body: { isbn: null, authors: [] } }), {
      bookId: BOOK_ID.toUpperCase(),
    });
    const [call] = calls();
    expect(call?.url).toBe(`${API}/books/${BOOK_ID}`);
    expect(call?.init.method).toBe('PATCH');
    expect(JSON.parse(String(call?.init.body))).toEqual({ isbn: null, authors: [] });
  });

  it('answers 204 with no body for deletes and membership writes', async () => {
    const { calls } = backend(
      new Response(null, { status: 204 }),
      new Response(null, { status: 204 }),
    );
    const deleted = await run('DELETE', deleteBook, request('DELETE', '/x'), { bookId: BOOK_ID });
    const added = await run('PUT', groupOperations('collections').addBook, request('PUT', '/x'), {
      groupId: GROUP_ID,
      bookId: BOOK_ID,
    });

    for (const response of [deleted, added]) {
      expect(response.status).toBe(204);
      expect(await response.text()).toBe('');
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
    expect(calls().map(({ url, init }) => [init.method, url])).toEqual([
      ['DELETE', `${API}/books/${BOOK_ID}`],
      ['PUT', `${API}/collections/${GROUP_ID}/books/${BOOK_ID}`],
    ]);
    expect(calls()[1]?.init.body).toBeUndefined();
  });

  it('acquires a wish with only the book id', async () => {
    const wish = {
      id: GROUP_ID,
      title: 'Emma',
      authors: [],
      priority: 'medium',
      status: 'acquired',
      acquiredBookId: BOOK_ID,
      acquiredAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const { calls } = backend(jsonResponse(200, { data: wish }));
    const response = await run(
      'PUT',
      acquireWish,
      request('PUT', '/x', { body: { bookId: BOOK_ID } }),
      {
        itemId: GROUP_ID,
      },
    );
    expect(response.status).toBe(200);
    expect(calls()[0]?.url).toBe(`${API}/wishlist/${GROUP_ID}/acquisition`);
    expect(JSON.parse(String(calls()[0]?.init.body))).toEqual({ bookId: BOOK_ID });
  });

  it('searches with only allowlisted parameters', async () => {
    const pagination = { page: 2, limit: 20, total: 21, totalPages: 2 };
    const { calls } = backend(jsonResponse(200, { data: [BOOK], meta: { pagination } }));
    const response = await run(
      'GET',
      searchBooks,
      request('GET', '/x?q=war%20peace&format=physical&page=2'),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { items: [BOOK], pagination } });
    expect(calls()[0]?.url).toBe(
      `${API}/books?page=2&limit=20&q=war+peace&format=physical&sort=recent`,
    );
  });

  it.each([
    ['an unknown parameter', '/x?q=a&ownerId=1'],
    ['a repeated parameter', '/x?q=a&q=b'],
    ['an invalid page', '/x?page=0'],
    ['a search without letters', '/x?q=%21%21'],
  ])('refuses a search with %s', async (_name, path) => {
    const { fetchImpl } = backend();
    const response = await run('GET', searchBooks, request('GET', path));
    expect(response.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('API errors are mapped to safe responses', () => {
  it.each([
    [apiError(404, 'NOT_FOUND', 'Book not found'), 404, 'NOT_FOUND', 'Book not found'],
    [apiError(404, 'NOT_FOUND', 'Route not found at /internal'), 404, 'NOT_FOUND', 'Not found'],
    [
      apiError(409, 'BOOK_HAS_PHYSICAL_COPIES', 'x'),
      409,
      'BOOK_HAS_PHYSICAL_COPIES',
      'This book has (or once had) physical copies, so it cannot become an ebook.',
    ],
    [
      apiError(409, 'CONFLICT', 'A category with this name already exists'),
      409,
      'CONFLICT',
      'A category with this name already exists.',
    ],
    [
      apiError(409, 'CONFLICT', 'E11000 duplicate key {name: "x"}'),
      409,
      'CONFLICT',
      'This conflicts with something that already exists.',
    ],
    [
      apiError(500, 'INTERNAL_ERROR', 'mongo at 10.0.0.3 failed'),
      503,
      'SERVICE_UNAVAILABLE',
      undefined,
    ],
    [
      new Response('<html>bad gateway</html>', {
        status: 502,
        headers: { 'Content-Type': 'text/html' },
      }),
      503,
      'SERVICE_UNAVAILABLE',
      undefined,
    ],
  ])('%#', async (upstream, status, code, message) => {
    backend(upstream);
    const response = await run(
      'PATCH',
      updateBook,
      request('PATCH', '/x', { body: { format: 'ebook' } }),
      {
        bookId: BOOK_ID,
      },
    );
    expect(response.status).toBe(status);
    const body = await response.json();
    expect(body.error.code).toBe(code);
    if (message) expect(body.error.message).toBe(message);
    expect(JSON.stringify(body)).not.toMatch(/10\.0\.0\.3|E11000|internal|bad gateway/);
  });

  it('relays field details and Retry-After', async () => {
    backend(
      apiError(400, 'VALIDATION_ERROR', 'x', {
        details: [{ field: 'title', message: 'Title is required' }],
      }),
      jsonResponse(429, { error: { code: 'RATE_LIMITED', message: 'x' } }, { 'Retry-After': '60' }),
    );
    const invalid = await run(
      'POST',
      createBook,
      request('POST', '/x', { body: { title: 'x', format: 'ebook' } }),
    );
    expect((await invalid.json()).error.fields).toEqual([
      { field: 'title', message: 'Title is required' },
    ]);
    const limited = await run(
      'POST',
      createBook,
      request('POST', '/x', { body: { title: 'x', format: 'ebook' } }),
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('60');
  });

  it('reports an unreachable API as unavailable, not as an empty result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('fetch failed'))),
    );
    const response = await run('GET', searchBooks, request('GET', '/x'));
    expect(response.status).toBe(503);
  });

  it('never returns backend tokens', async () => {
    backend(jsonResponse(201, { data: BOOK }));
    const response = await run(
      'POST',
      createBook,
      request('POST', '/x', { body: { title: 'x', format: 'ebook' } }),
    );
    expect(`${await response.text()}${JSON.stringify([...response.headers])}`).not.toContain(
      accessToken,
    );
  });
});
