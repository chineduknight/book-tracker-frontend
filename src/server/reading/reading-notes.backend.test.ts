// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { NextRequest } from 'next/server';
import { beforeAll, describe, expect, inject, it } from 'vitest';
import { createApiClient, type ApiClient } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { createMemorySessionStore } from '@/test/fixtures/memory-session-store';
import { createBackendAuth } from '../auth/backend-auth';
import { handleLibraryOperation, type LibraryMethod } from '../http/library-route';
import * as library from '../library/library-api';
import type { CreateBook } from '../library/library-schemas';
import * as notes from '../notes/note-api';
import { createNote, deleteNote, updateNote } from '../notes/note-operations';
import { loadNotesPage } from '../notes/note-pages';
import { createSessionService } from '../session/session-service';
import type { BffRuntime } from '../session/session-runtime';
import { createTokenVault } from '../session/token-vault';
import * as reading from './reading-api';
import {
  getReadingOverview,
  listBookSessions,
  startSession,
  updateSession,
} from './reading-operations';
import { loadReadingHistory } from './reading-pages';

/*
 * Reading and notes against the real, merged API (pinned in CI) and a disposable local MongoDB.
 * Every response passes the BFF's own DTO schemas, so a contract drift fails here.
 */
const apiBaseUrl = inject('apiBaseUrl');
const backendAuth = createBackendAuth({ apiBaseUrl });

async function newReader() {
  const signedIn = await backendAuth.register({
    name: 'Contract Reader',
    email: `contract-rn-${randomBytes(6).toString('hex')}@example.test`,
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

function newBook(title: string, extra: Partial<CreateBook> = {}) {
  return library.createBook(alice, { title, format: 'ebook', ...extra });
}

describe('reading sessions', () => {
  it('starts, progresses (also downwards), never auto-completes, and finishes explicitly', async () => {
    const book = await newBook('Persuasion', { pageCount: 250, chapterCount: 24 });
    const started = await reading.startSession(alice, book.id, {});
    expect(started).toMatchObject({ status: 'in_progress', progress: null, bookId: book.id });
    expect(started).not.toHaveProperty('startedOn');

    const atEnd = await reading.updateSession(alice, started.id, {
      progress: { unit: 'pages', value: 250 },
    });
    expect(atEnd.status).toBe('in_progress'); // the last page does not finish the reading
    const back = await reading.updateSession(alice, started.id, {
      progress: { unit: 'pages', value: 120 },
    });
    expect(back.progress).toEqual({ unit: 'pages', value: 120 });

    const beyond = await apiError(
      reading.updateSession(alice, started.id, { progress: { unit: 'pages', value: 251 } }),
    );
    expect(beyond.status).toBe(400);
    expect(beyond.details).toContainEqual({
      field: 'progress.value',
      message: "must not exceed the book's page count",
    });
    const chapters = await apiError(
      reading.updateSession(alice, started.id, { progress: { unit: 'chapters', value: 25 } }),
    );
    expect(chapters.status).toBe(400);

    const finished = await reading.updateSession(alice, started.id, { status: 'completed' });
    expect(finished.status).toBe('completed');
    expect(finished).not.toHaveProperty('completedOn'); // no date is invented
  });

  it('has one reading in progress per book, keeps every finished one, and rereads as a new reading', async () => {
    const book = await newBook('Emma');
    const first = await reading.startSession(alice, book.id, { startedOn: '2026-01-02' });
    const duplicate = await apiError(reading.startSession(alice, book.id, {}));
    expect(duplicate).toMatchObject({ status: 409, code: 'READING_SESSION_IN_PROGRESS' });

    // A historical finished read can be recorded while another is in progress.
    const earlier = await reading.startSession(alice, book.id, {
      status: 'completed',
      rating: 4,
    });
    expect(earlier).not.toHaveProperty('completedOn');

    await reading.updateSession(alice, first.id, {
      status: 'completed',
      completedOn: '2026-02-01',
    });
    const reopen = await apiError(
      reading.updateSession(alice, first.id, { status: 'in_progress' }),
    );
    expect(reopen).toMatchObject({ status: 409, code: 'INVALID_READING_TRANSITION' });

    const reread = await reading.startSession(alice, book.id, {});
    const overview = await reading.getReadingOverview(alice, book.id);
    expect(overview).toMatchObject({ status: 'reading', totalSessions: 3, completedSessions: 2 });
    expect(overview.activeSession?.id).toBe(reread.id);
    expect(overview.lastCompletedSession).not.toBeNull();

    const original = await reading.getSession(alice, first.id);
    expect(original).toMatchObject({
      status: 'completed',
      startedOn: '2026-01-02',
      completedOn: '2026-02-01',
    });

    const history = await reading.listBookSessions(alice, book.id, { page: 1, limit: 20 });
    expect(history.pagination.total).toBe(3);
    const finishedOnly = await reading.listBookSessions(alice, book.id, {
      page: 1,
      limit: 20,
      status: 'completed',
    });
    expect(finishedOnly.items.every((session) => session.status === 'completed')).toBe(true);
  });

  it('validates calendar days and their order against the resulting session', async () => {
    const book = await newBook('Sanditon');
    const session = await reading.startSession(alice, book.id, { startedOn: '2028-02-29' });
    expect(session.startedOn).toBe('2028-02-29'); // a leap day, stored exactly

    const notLeap = await apiError(
      reading.updateSession(alice, session.id, { startedOn: '2027-02-29' }),
    );
    expect(notLeap.status).toBe(400);
    const onlyWhenFinished = await apiError(
      reading.updateSession(alice, session.id, { completedOn: '2028-03-01' }),
    );
    expect(onlyWhenFinished.details).toContainEqual({
      field: 'completedOn',
      message: 'can only be set on a completed reading session',
    });
    const beforeStart = await apiError(
      reading.updateSession(alice, session.id, { status: 'completed', completedOn: '2028-02-28' }),
    );
    expect(beforeStart.details).toContainEqual({
      field: 'completedOn',
      message: 'must be on or after startedOn',
    });
    const cleared = await reading.updateSession(alice, session.id, {
      startedOn: null,
      rating: 5,
      summary: '  Unfinished,\n\nbut lovely.  ',
    });
    expect(cleared).not.toHaveProperty('startedOn');
    expect(cleared.summary).toBe('Unfinished,\n\nbut lovely.');
  });

  it('pages the global history with real totals and the books behind it', async () => {
    const book = await newBook('Lady Susan');
    await reading.startSession(alice, book.id, {});
    const page = await loadReadingHistory(alice, { sort: 'recent', page: 1 });
    expect(page.totals.inProgress).toBeGreaterThan(0);
    expect(page.rows[0]?.book?.id).toBe(book.id);
    const inProgress = await reading.listReadingHistory(alice, {
      page: 1,
      limit: 100,
      status: 'in_progress',
    });
    expect(inProgress.items.every((session) => session.status === 'in_progress')).toBe(true);
  });
});

describe('notes and highlights', () => {
  it('keeps text verbatim, searches whole words and exact chapters, and never changes kind', async () => {
    const book = await newBook('Middlemarch');
    const source = '  # Dorothea\n\n*Ardent*   soul — "quoted" & <b>not html</b>  ';
    const note = await notes.createNote(alice, book.id, {
      kind: 'note',
      content: source,
      chapter: 'Café  Society',
      pageNumber: 42,
    });
    expect(note.content).toBe(source.trim());
    expect(note.readingSessionId).toBeNull();

    const highlight = await notes.createNote(alice, book.id, {
      kind: 'highlight',
      content: '[click](javascript:alert(1)) ![x](https://tracker.example/p.png)',
      commentary: 'Odd *markdown* in a quote',
    });
    expect(highlight.content).toContain('javascript:');

    const tooLong = await apiError(
      notes.createNote(alice, book.id, { kind: 'highlight', content: 'x'.repeat(5_001) }),
    );
    expect(tooLong.status).toBe(400);

    const byWord = await notes.listNotes(alice, {
      page: 1,
      limit: 20,
      bookId: book.id,
      q: 'ARDENT',
    });
    expect(byWord.items.map((item) => item.id)).toEqual([note.id]);
    const prefix = await notes.listNotes(alice, {
      page: 1,
      limit: 20,
      bookId: book.id,
      q: 'arden',
    });
    expect(prefix.pagination.total).toBe(0);
    const chapter = await notes.listNotes(alice, {
      page: 1,
      limit: 20,
      bookId: book.id,
      chapter: 'café society',
    });
    expect(chapter.items.map((item) => item.id)).toEqual([note.id]);
    const highlights = await notes.listBookNotes(alice, book.id, {
      page: 1,
      limit: 20,
      kind: 'highlight',
    });
    expect(highlights.items.map((item) => item.id)).toEqual([highlight.id]);

    const edited = await notes.updateNote(alice, note.id, {
      chapter: null,
      pageNumber: null,
      title: 'Dorothea',
    });
    expect(edited).not.toHaveProperty('chapter');
    expect(edited).toMatchObject({ kind: 'note', title: 'Dorothea', content: source.trim() });
  });

  it('links notes only to a reading of the same book, permanently', async () => {
    const book = await newBook('Daniel Deronda');
    const other = await newBook('Romola');
    const session = await reading.startSession(alice, book.id, {});
    const otherSession = await reading.startSession(alice, other.id, {});

    const linked = await notes.createNote(alice, book.id, {
      kind: 'highlight',
      content: 'A quotation.',
      readingSessionId: session.id,
    });
    expect(linked.readingSessionId).toBe(session.id);
    const mismatch = await apiError(
      notes.createNote(alice, book.id, {
        kind: 'note',
        content: 'x',
        readingSessionId: otherSession.id,
      }),
    );
    expect(mismatch).toMatchObject({ status: 409, code: 'READING_SESSION_BOOK_MISMATCH' });

    const ofSession = await notes.listNotes(alice, {
      page: 1,
      limit: 20,
      bookId: book.id,
      readingSessionId: session.id,
    });
    expect(ofSession.items.map((item) => item.id)).toEqual([linked.id]);
    // A filter naming another book's reading is reported, never shown as "no notes".
    const invalid = await loadNotesPage(alice, {
      bookId: book.id,
      readingSessionId: otherSession.id,
      sort: 'recent',
      page: 1,
      invalidFilter: false,
    });
    expect(invalid.status).toBe('invalid-filter');

    // Completing the reading changes nothing about its notes.
    await reading.updateSession(alice, session.id, { status: 'completed' });
    expect((await notes.getNote(alice, linked.id)).readingSessionId).toBe(session.id);
  });

  it('soft-deletes: the note then behaves as missing everywhere', async () => {
    const book = await newBook('Felix Holt');
    const note = await notes.createNote(alice, book.id, {
      kind: 'note',
      content: 'Radical thoughts',
    });
    await notes.deleteNote(alice, note.id);
    expect((await apiError(notes.getNote(alice, note.id))).status).toBe(404);
    expect((await apiError(notes.updateNote(alice, note.id, { title: 'x' }))).status).toBe(404);
    expect((await apiError(notes.deleteNote(alice, note.id))).status).toBe(404);
    const list = await notes.listBookNotes(alice, book.id, { page: 1, limit: 20 });
    expect(list.pagination.total).toBe(0);
  });
});

describe('isolation and deleted books', () => {
  it('another reader gets the same 404 for every foreign book, reading and note', async () => {
    const book = await newBook('Adam Bede');
    const session = await reading.startSession(alice, book.id, {});
    const note = await notes.createNote(alice, book.id, { kind: 'note', content: 'Private.' });

    for (const attempt of [
      () => reading.getSession(bob, session.id),
      () => reading.updateSession(bob, session.id, { rating: 1 }),
      () => reading.getReadingOverview(bob, book.id),
      () => reading.startSession(bob, book.id, {}),
      () => reading.listBookSessions(bob, book.id, { page: 1, limit: 20 }),
      () => notes.getNote(bob, note.id),
      () => notes.updateNote(bob, note.id, { title: 'x' }),
      () => notes.deleteNote(bob, note.id),
      () => notes.createNote(bob, book.id, { kind: 'note', content: 'x' }),
      () => notes.listNotes(bob, { page: 1, limit: 20, bookId: book.id }),
    ]) {
      const error = await apiError(attempt());
      expect(error.status).toBe(404);
      expect(JSON.stringify(error)).not.toContain('Private.');
    }
    expect((await notes.getNote(alice, note.id)).content).toBe('Private.');
  });

  it('hides the readings and notes of a deleted book without deleting them', async () => {
    const book = await newBook('Silas Marner');
    const session = await reading.startSession(alice, book.id, {});
    const note = await notes.createNote(alice, book.id, { kind: 'note', content: 'Eppie' });
    await library.deleteBook(alice, book.id);

    const sessionError = await apiError(reading.getSession(alice, session.id));
    expect(sessionError.message).toBe('Reading session not found');
    expect((await apiError(notes.getNote(alice, note.id))).message).toBe('Note not found');
    const all = await notes.listNotes(alice, { page: 1, limit: 100, q: 'eppie' });
    expect(all.pagination.total).toBe(0);
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

  function request(method: LibraryMethod, body?: unknown, search = '') {
    return new NextRequest(`${ORIGIN}/api/x${search}`, {
      method,
      headers: {
        cookie: `__Host-avuneri_session=${cookie}`,
        ...(method === 'GET' ? {} : { origin: ORIGIN, 'sec-fetch-site': 'same-origin' }),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  it('starts, refuses a duplicate with a mapped code, pages readings, and finishes', async () => {
    const book = await newBook('Middlemarch, again');
    const started = await handleLibraryOperation(
      request('POST', {}),
      runtime,
      { bookId: book.id },
      'POST',
      startSession,
    );
    expect(started.status).toBe(201);
    const { data: session } = await started.json();

    const duplicate = await handleLibraryOperation(
      request('POST', {}),
      runtime,
      { bookId: book.id },
      'POST',
      startSession,
    );
    expect(duplicate.status).toBe(409);
    expect((await duplicate.json()).error.code).toBe('READING_SESSION_IN_PROGRESS');

    const overview = await handleLibraryOperation(
      request('GET'),
      runtime,
      { bookId: book.id },
      'GET',
      getReadingOverview,
    );
    expect((await overview.json()).data.activeSession.id).toBe(session.id);
    const page = await handleLibraryOperation(
      request('GET', undefined, '?page=1'),
      runtime,
      { bookId: book.id },
      'GET',
      listBookSessions,
    );
    expect((await page.json()).data.items).toHaveLength(1);

    const finished = await handleLibraryOperation(
      request('PATCH', { status: 'completed' }),
      runtime,
      { sessionId: session.id },
      'PATCH',
      updateSession,
    );
    expect((await finished.json()).data).not.toHaveProperty('completedOn');
    const reopen = await handleLibraryOperation(
      request('PATCH', { status: 'in_progress' }),
      runtime,
      { sessionId: session.id },
      'PATCH',
      updateSession,
    );
    expect((await reopen.json()).error.code).toBe('INVALID_READING_TRANSITION');
  });

  it('saves a 20,000-character note well past the 32 KiB library cap, and deletes with an empty 204', async () => {
    const book = await newBook('Long notes');
    const content = 'é'.repeat(19_990) + '\nend'; // ~40 kB of UTF-8
    const created = await handleLibraryOperation(
      request('POST', { kind: 'note', content }),
      runtime,
      { bookId: book.id },
      'POST',
      createNote,
    );
    expect(created.status).toBe(201);
    const { data: note } = await created.json();
    expect(note.content).toBe(content);

    const kindChange = await handleLibraryOperation(
      request('PATCH', { kind: 'highlight' }),
      runtime,
      { noteId: note.id },
      'PATCH',
      updateNote,
    );
    expect(kindChange.status).toBe(400);

    const removed = await handleLibraryOperation(
      request('DELETE'),
      runtime,
      { noteId: note.id },
      'DELETE',
      deleteNote,
    );
    expect(removed.status).toBe(204);
    expect(await removed.text()).toBe('');
    const again = await handleLibraryOperation(
      request('DELETE'),
      runtime,
      { noteId: note.id },
      'DELETE',
      deleteNote,
    );
    expect(again.status).toBe(404);
    expect((await again.json()).error.message).toBe('Note not found');
  });
});
