// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeBackendAuth } from '@/test/fixtures/fake-backend-auth';
import { errorResponse as apiError, fakeFetch, jsonResponse } from '@/test/fixtures/fetch';
import { createMemorySessionStore } from '@/test/fixtures/memory-session-store';
import { MAX_NOTE_REQUEST_BYTES } from '@/lib/notes/rules';
import type { BffConfig } from '../config';
import { createBook } from '../library/library-operations';
import { createNote, deleteNote, updateNote } from '../notes/note-operations';
import {
  getReadingOverview,
  listBookSessions,
  startSession,
  updateSession,
} from '../reading/reading-operations';
import { createSessionService } from '../session/session-service';
import type { BffRuntime } from '../session/session-runtime';
import { createTokenVault } from '../session/token-vault';
import { handleLibraryOperation, type LibraryMethod, type LibraryOperation } from './library-route';

const ORIGIN = 'https://avuneri.example';
const API = 'https://api.avuneri.example/api/v1';
const BOOK_ID = '665f1c2ab4e5d1a2b3c4d5e6';
const SESSION_ID = '665f1c2ab4e5d1a2b3c4d5e8';
const NOTE_ID = '665f1c2ab4e5d1a2b3c4d5e9';
const NOW = '2026-11-15T10:00:00.000Z';
const SESSION = {
  id: SESSION_ID,
  bookId: BOOK_ID,
  status: 'in_progress',
  progress: null,
  createdAt: NOW,
  updatedAt: NOW,
};
const NOTE = {
  id: NOTE_ID,
  bookId: BOOK_ID,
  readingSessionId: null,
  kind: 'note',
  content: 'x',
  createdAt: NOW,
  updatedAt: NOW,
};

let runtime: BffRuntime;
let cookie: string;

beforeEach(async () => {
  const fake = createFakeBackendAuth();
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
  cookie = (await sessions.startSession(await fake.signUp(), new Date())).sessionSecret;
});

afterEach(() => vi.unstubAllGlobals());

function backend(...responses: Response[]) {
  const stub = fakeFetch(...responses);
  vi.stubGlobal('fetch', stub.fetchImpl);
  return stub;
}

function request(
  method: LibraryMethod,
  options: { body?: unknown; headers?: Record<string, string>; search?: string } = {},
) {
  const { body, headers = {}, search = '' } = options;
  const hasBody = body !== undefined;
  return new NextRequest(`${ORIGIN}/api/x${search}`, {
    method,
    headers: {
      ...(method === 'GET' ? {} : { origin: ORIGIN, 'sec-fetch-site': 'same-origin' }),
      ...(hasBody ? { 'content-type': 'application/json' } : {}),
      cookie: `__Host-avuneri_session=${cookie}`,
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

describe('origin checks on every reading and note write', () => {
  const cases: Array<[string, LibraryMethod, (req: NextRequest) => Promise<Response>, unknown]> = [
    ['start a reading', 'POST', (req) => run('POST', startSession, req, { bookId: BOOK_ID }), {}],
    [
      'update a reading',
      'PATCH',
      (req) => run('PATCH', updateSession, req, { sessionId: SESSION_ID }),
      { rating: 3 },
    ],
    [
      'create a note',
      'POST',
      (req) => run('POST', createNote, req, { bookId: BOOK_ID }),
      { kind: 'note', content: 'x' },
    ],
    [
      'edit a note',
      'PATCH',
      (req) => run('PATCH', updateNote, req, { noteId: NOTE_ID }),
      { title: 'x' },
    ],
    [
      'delete a note',
      'DELETE',
      (req) => run('DELETE', deleteNote, req, { noteId: NOTE_ID }),
      undefined,
    ],
  ];

  it.each(cases)(
    '%s refuses a foreign origin before calling the API',
    async (_name, method, send, body) => {
      const { fetchImpl } = backend();
      const response = await send(
        request(method, { body, headers: { origin: 'https://evil.example' } }),
      );
      expect(response.status).toBe(403);
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );

  it.each(cases)('%s refuses a cross-site fetch', async (_name, method, send, body) => {
    const { fetchImpl } = backend();
    const response = await send(
      request(method, { body, headers: { 'sec-fetch-site': 'cross-site' } }),
    );
    expect(response.status).toBe(403);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each(cases)(
    '%s refuses an unauthenticated request before calling the API',
    async (_name, method, send, body) => {
      const { fetchImpl } = backend();
      const req = request(method, { body });
      req.cookies.delete('__Host-avuneri_session');
      const response = await send(
        new NextRequest(req.url, {
          method,
          headers: {
            origin: ORIGIN,
            'sec-fetch-site': 'same-origin',
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
      );
      expect(response.status).toBe(401);
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );
});

describe('note request size', () => {
  it('accepts a maximal 20,000-character note that the 32 KiB library cap would refuse', async () => {
    const { calls } = backend(jsonResponse(201, { data: NOTE }));
    const content = '€'.repeat(20_000); // 60,000 bytes of UTF-8
    const response = await run(
      'POST',
      createNote,
      request('POST', { body: { kind: 'note', content } }),
      {
        bookId: BOOK_ID,
      },
    );
    expect(response.status).toBe(201);
    expect(JSON.parse(String(calls()[0]?.init.body)).content).toBe(content);
  });

  it('still caps library writes at 32 KiB', async () => {
    const { fetchImpl } = backend();
    const response = await run(
      'POST',
      createBook,
      request('POST', {
        body: { title: 'x', format: 'ebook', description: '€'.repeat(4_999) + 'x'.repeat(20_000) },
      }),
    );
    expect(response.status).toBe(413);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a body over 100 kB on the streamed bytes, with a friendly 413', async () => {
    const { fetchImpl } = backend();
    const body = JSON.stringify({
      kind: 'note',
      content: 'x',
      title: 'y'.repeat(MAX_NOTE_REQUEST_BYTES),
    });
    const response = await run('POST', createNote, request('POST', { body }), { bookId: BOOK_ID });
    expect(response.status).toBe(413);
    expect((await response.json()).error).toEqual({
      code: 'PAYLOAD_TOO_LARGE',
      message: 'The request is too large.',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a valid 20,000-character note of escaped control characters (over 100 kB as JSON)', async () => {
    const { fetchImpl } = backend();
    // Each control character travels as a 6-byte \u escape: 120 kB, as the API documents.
    const body = JSON.stringify({ kind: 'note', content: 'a' + '\u0001'.repeat(19_998) + 'b' });
    expect(Buffer.byteLength(body)).toBeGreaterThan(MAX_NOTE_REQUEST_BYTES);
    const response = await run('POST', createNote, request('POST', { body }), { bookId: BOOK_ID });
    expect(response.status).toBe(413);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('maps the API’s own 413 to the same friendly error', async () => {
    backend(apiError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large'));
    const response = await run(
      'POST',
      createNote,
      request('POST', { body: { kind: 'note', content: 'x' } }),
      {
        bookId: BOOK_ID,
      },
    );
    expect(response.status).toBe(413);
    expect((await response.json()).error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('strict request shapes', () => {
  it.each([
    ['kind on a note edit', { kind: 'highlight' }],
    ['readingSessionId on a note edit', { readingSessionId: SESSION_ID }],
    ['bookId on a note edit', { bookId: BOOK_ID }],
    ['an empty note edit', {}],
    ['clearing note content', { content: null }],
    ['a blank title', { title: '   ' }],
  ])('refuses %s without calling the API', async (_name, body) => {
    const { fetchImpl } = backend();
    const response = await run('PATCH', updateNote, request('PATCH', { body }), {
      noteId: NOTE_ID,
    });
    expect(response.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ['a highlight over 5,000 characters', { kind: 'highlight', content: 'x'.repeat(5_001) }],
    ['a note over 20,000 characters', { kind: 'note', content: 'x'.repeat(20_001) }],
    ['a missing kind', { content: 'x' }],
    ['a malformed reading id', { kind: 'note', content: 'x', readingSessionId: 'abc' }],
    ['a page reference of 0', { kind: 'note', content: 'x', pageNumber: 0 }],
  ])('refuses %s on create', async (_name, body) => {
    const { fetchImpl } = backend();
    const response = await run('POST', createNote, request('POST', { body }), { bookId: BOOK_ID });
    expect(response.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ['a readingStatus field', { readingStatus: 'reading' }],
    ['two progress metrics', { progress: { unit: 'pages', value: 3, percent: 4 } }],
    ['fractional progress', { progress: { unit: 'percent', value: 4.5 } }],
    ['percent over 100', { progress: { unit: 'percent', value: 101 } }],
    ['an impossible date', { startedOn: '2027-02-29' }],
    ['a timestamp instead of a day', { startedOn: '2026-03-01T00:00:00Z' }],
    ['a rating of 6', { rating: 6 }],
    ['a null status', { status: null }],
    ['no changes', {}],
  ])('refuses %s on a reading update', async (_name, body) => {
    const { fetchImpl } = backend();
    const response = await run('PATCH', updateSession, request('PATCH', { body }), {
      sessionId: SESSION_ID,
    });
    expect(response.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('names nested fields, e.g. progress.value', async () => {
    backend();
    const response = await run(
      'PATCH',
      updateSession,
      request('PATCH', { body: { progress: { unit: 'pages', value: -1 } } }),
      { sessionId: SESSION_ID },
    );
    expect((await response.json()).error.fields).toEqual([
      { field: 'progress.value', message: expect.any(String) },
    ]);
  });

  it('accepts a leap day and forwards PATCH nulls exactly', async () => {
    const { calls } = backend(jsonResponse(200, { data: SESSION }));
    const body = { startedOn: '2028-02-29', progress: null, rating: null, summary: null };
    const response = await run('PATCH', updateSession, request('PATCH', { body }), {
      sessionId: SESSION_ID.toUpperCase(),
    });
    expect(response.status).toBe(200);
    expect(calls()[0]?.url).toBe(`${API}/reading-sessions/${SESSION_ID}`);
    expect(JSON.parse(String(calls()[0]?.init.body))).toEqual(body);
  });

  it.each([
    ['?page=1&page=2', 'must be given only once'],
    ['?limit=100', 'is not a supported parameter'],
    ['?page=0', 'must be a positive whole number'],
  ])('allowlists the reading picker query %s', async (search, message) => {
    const { fetchImpl } = backend();
    const response = await run('GET', listBookSessions, request('GET', { search }), {
      bookId: BOOK_ID,
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error.fields[0].message).toBe(message);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('pages a book’s readings with a fixed limit', async () => {
    const { calls } = backend(
      jsonResponse(200, {
        data: [SESSION],
        meta: { pagination: { page: 2, limit: 20, total: 21, totalPages: 2 } },
      }),
    );
    const response = await run('GET', listBookSessions, request('GET', { search: '?page=2' }), {
      bookId: BOOK_ID,
    });
    expect(response.status).toBe(200);
    expect(calls()[0]?.url).toBe(`${API}/books/${BOOK_ID}/reading-sessions?page=2&limit=20`);
  });

  it('refuses parameters on the overview', async () => {
    const { fetchImpl } = backend();
    const response = await run('GET', getReadingOverview, request('GET', { search: '?x=1' }), {
      bookId: BOOK_ID,
    });
    expect(response.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('API outcomes', () => {
  it('deletes a note with an empty 204', async () => {
    backend(new Response(null, { status: 204 }));
    const response = await run('DELETE', deleteNote, request('DELETE'), { noteId: NOTE_ID });
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
  });

  it.each([
    ['READING_SESSION_IN_PROGRESS', 'You’re already reading this book.'],
    [
      'INVALID_READING_TRANSITION',
      'A finished reading can’t be reopened. Start a new reading to reread the book.',
    ],
    [
      'READING_SESSION_UPDATE_CONFLICT',
      'This reading was being changed somewhere else at the same time.',
    ],
    ['READING_SESSION_BOOK_MISMATCH', 'That reading belongs to a different book.'],
  ])('maps 409 %s to a fixed message', async (code, message) => {
    backend(apiError(409, code, 'upstream text that is never shown'));
    const response = await run('PATCH', updateSession, request('PATCH', { body: { rating: 2 } }), {
      sessionId: SESSION_ID,
    });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toEqual({ code, message });
  });

  it.each([
    ['Reading session not found', 'Reading session not found'],
    ['Note not found', 'Note not found'],
    ['Secret thing of reader 42 not found', 'Not found'],
  ])('passes only allowlisted 404 messages (%s)', async (upstream, shown) => {
    backend(apiError(404, 'NOT_FOUND', upstream));
    const response = await run('DELETE', deleteNote, request('DELETE'), { noteId: NOTE_ID });
    expect(response.status).toBe(404);
    expect((await response.json()).error.message).toBe(shown);
  });

  it('passes a rate limit through with its Retry-After', async () => {
    backend(apiError(429, 'RATE_LIMITED', 'Too many', {}));
    const response = await run('POST', startSession, request('POST', { body: {} }), {
      bookId: BOOK_ID,
    });
    expect(response.status).toBe(429);
    expect((await response.json()).error.code).toBe('RATE_LIMITED');
  });

  it('turns an API outage into 503, never an empty result', async () => {
    backend(apiError(503, 'SERVICE_UNAVAILABLE', 'db down'));
    const response = await run('GET', listBookSessions, request('GET'), { bookId: BOOK_ID });
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('refuses a response that does not match the reading DTO', async () => {
    backend(jsonResponse(201, { data: { ...SESSION, readingStatus: 'x', status: 'paused' } }));
    const response = await run('POST', startSession, request('POST', { body: {} }), {
      bookId: BOOK_ID,
    });
    expect(response.status).toBe(503);
  });
});
