// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { NextRequest } from 'next/server';
import { beforeAll, describe, expect, inject, it } from 'vitest';
import { createApiClient, type ApiClient } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { createMemorySessionStore } from '@/test/fixtures/memory-session-store';
import { createBackendAuth } from '../auth/backend-auth';
import * as dashboard from '../dashboard/dashboard-api';
import { loadRecentActivity } from '../dashboard/dashboard-pages';
import { handleLibraryOperation, type LibraryMethod } from '../http/library-route';
import * as library from '../library/library-api';
import * as notes from '../notes/note-api';
import * as reading from '../reading/reading-api';
import { createSessionService } from '../session/session-service';
import type { BffRuntime } from '../session/session-runtime';
import { createTokenVault } from '../session/token-vault';
import * as lending from './lending-api';
import { createLoan, returnLoan, updateLoan } from './lending-operations';
import { loadLoanLedger } from './lending-pages';

/*
 * Loans and the dashboard against the real, merged API (pinned in CI) on a disposable local
 * MongoDB. Every response passes the BFF's own DTO schemas, so a contract drift fails here.
 */
const apiBaseUrl = inject('apiBaseUrl');
const backendAuth = createBackendAuth({ apiBaseUrl });

async function newReader() {
  const signedIn = await backendAuth.register({
    name: 'Contract Lender',
    email: `contract-ld-${randomBytes(6).toString('hex')}@example.test`,
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

async function physicalBookWithCopies(api: ApiClient, title: string, copies = 2) {
  const book = await library.createBook(api, { title, format: 'physical' });
  const made = [];
  for (let index = 0; index < copies; index += 1) {
    made.push(await library.createCopy(api, book.id, { label: `Copy ${index + 1}` }));
  }
  return { book, copies: made };
}

const ALL = { page: 1, limit: 100, status: 'all' } as const;

describe('loans', () => {
  it('lends two copies of one book independently, one active loan per copy, even concurrently', async () => {
    const { copies } = await physicalBookWithCopies(alice, 'Middlemarch');
    const [first, second] = copies as [(typeof copies)[0], (typeof copies)[0]];
    const loan = await lending.createLoan(alice, first.id, {
      borrowerName: 'Ada',
      borrowerContact: 'ada@example.test',
      lentOn: '2026-03-01',
    });
    expect(loan).toMatchObject({ copyId: first.id, lentOn: '2026-03-01', returnedOn: null });
    expect(loan).not.toHaveProperty('dueOn'); // nothing invented
    await lending.createLoan(alice, second.id, { borrowerName: 'Grace', lentOn: '2026-03-02' });

    const again = await apiError(
      lending.createLoan(alice, first.id, { borrowerName: 'X', lentOn: '2026-03-03' }),
    );
    expect(again).toMatchObject({ status: 409, code: 'COPY_ALREADY_ON_LOAN' });

    const {
      copies: [solo],
    } = await physicalBookWithCopies(alice, 'Romola', 1);
    const race = await Promise.allSettled(
      ['One', 'Two', 'Three'].map((name) =>
        lending.createLoan(alice, solo!.id, { borrowerName: name, lentOn: '2026-03-04' }),
      ),
    );
    expect(race.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    for (const outcome of race.filter((item) => item.status === 'rejected')) {
      expect((outcome as PromiseRejectedResult).reason).toMatchObject({
        code: 'COPY_ALREADY_ON_LOAN',
      });
    }
    const overview = await lending.getCopyLoanOverview(alice, solo!.id);
    expect(overview.isOnLoan).toBe(true);
  });

  it('returns once with an explicit day; same day is idempotent, another is a conflict; PATCH corrects it', async () => {
    const {
      copies: [copy],
    } = await physicalBookWithCopies(alice, 'Felix Holt', 1);
    const loan = await lending.createLoan(alice, copy!.id, {
      borrowerName: 'Ada',
      lentOn: '2026-03-01',
      dueOn: '2026-03-15',
    });
    const early = await apiError(lending.returnLoan(alice, loan.id, '2026-02-28'));
    expect(early.details).toContainEqual({
      field: 'returnedOn',
      message: 'must be on or after lentOn',
    });
    const notYet = await apiError(lending.updateLoan(alice, loan.id, { returnedOn: '2026-03-10' }));
    expect(notYet.status).toBe(400);

    const returned = await lending.returnLoan(alice, loan.id, '2026-03-10');
    expect(returned.returnedOn).toBe('2026-03-10');
    const same = await lending.returnLoan(alice, loan.id, '2026-03-10');
    expect(same.updatedAt).toBe(returned.updatedAt);
    const different = await apiError(lending.returnLoan(alice, loan.id, '2026-03-11'));
    expect(different).toMatchObject({ status: 409, code: 'LOAN_ALREADY_RETURNED' });

    const corrected = await lending.updateLoan(alice, loan.id, {
      returnedOn: '2026-03-12',
      note: 'Fine',
    });
    expect(corrected).toMatchObject({ returnedOn: '2026-03-12', note: 'Fine' });
    const cleared = await lending.updateLoan(alice, loan.id, { note: null, dueOn: null });
    expect(cleared).not.toHaveProperty('note');
    expect(cleared).not.toHaveProperty('dueOn');

    // The freed copy gets a new, independent loan; history is untouched.
    const next = await lending.createLoan(alice, copy!.id, {
      borrowerName: 'Grace',
      lentOn: '2028-02-29',
    });
    expect(next.lentOn).toBe('2028-02-29');
    const history = await lending.listCopyLoans(alice, copy!.id, ALL);
    expect(history.pagination.total).toBe(2);
    expect((await lending.getLoan(alice, loan.id)).returnedOn).toBe('2026-03-12');
  });

  it('applies the overdue boundary and real totals per status', async () => {
    const { copies } = await physicalBookWithCopies(alice, 'Daniel Deronda', 3);
    const [a, b, c] = copies as [(typeof copies)[0], (typeof copies)[0], (typeof copies)[0]];
    const due = await lending.createLoan(alice, a.id, {
      borrowerName: 'Due',
      lentOn: '2030-01-01',
      dueOn: '2030-01-10',
    });
    const open = await lending.createLoan(alice, b.id, {
      borrowerName: 'Open',
      lentOn: '2030-01-01',
    });
    const back = await lending.createLoan(alice, c.id, {
      borrowerName: 'Back',
      lentOn: '2030-01-01',
      dueOn: '2030-01-02',
    });
    await lending.returnLoan(alice, back.id, '2030-01-05');

    const overdueIds = async (asOf: string) =>
      (await lending.listLoans(alice, { page: 1, limit: 100, status: 'overdue', asOf })).items.map(
        (l) => l.id,
      );
    expect(await overdueIds('2030-01-10')).not.toContain(due.id); // due on the day: not overdue
    expect(await overdueIds('2030-01-11')).toContain(due.id);
    expect(await overdueIds('2099-01-01')).not.toContain(open.id); // no due day: never
    expect(await overdueIds('2099-01-01')).not.toContain(back.id); // returned: never

    const ledger = await loadLoanLedger(
      alice,
      { status: 'active', sort: 'recent', page: 1 },
      '2030-01-11',
    );
    expect(ledger.totals.all).toBe(ledger.totals.active + ledger.totals.returned);
    expect(ledger.totals.overdue).toBeLessThanOrEqual(ledger.totals.active);
    expect(ledger.rows.every(({ loan }) => loan.returnedOn === null)).toBe(true);
    const rowOf = ledger.rows.find(({ loan }) => loan.id === due.id);
    expect(rowOf?.copy?.id).toBe(a.id);
    expect(rowOf?.book?.title).toBe('Daniel Deronda');
  });

  it('keeps loans listed, readable, editable and returnable after their copy and book are deleted', async () => {
    const { book, copies } = await physicalBookWithCopies(alice, 'Silas Marner', 2);
    const [kept, removed] = copies as [(typeof copies)[0], (typeof copies)[0]];
    const ofRemoved = await lending.createLoan(alice, removed.id, {
      borrowerName: 'Ada',
      lentOn: '2026-03-01',
    });
    const ofBook = await lending.createLoan(alice, kept.id, {
      borrowerName: 'Grace',
      lentOn: '2026-03-01',
    });

    await library.deleteCopy(alice, removed.id);
    expect((await apiError(lending.getCopyLoanOverview(alice, removed.id))).message).toBe(
      'Copy not found',
    );
    expect((await apiError(lending.listCopyLoans(alice, removed.id, ALL))).status).toBe(404);
    expect((await lending.getLoan(alice, ofRemoved.id)).copyId).toBe(removed.id);
    await lending.updateLoan(alice, ofRemoved.id, { note: 'Copy gone, loan kept' });
    expect((await lending.returnLoan(alice, ofRemoved.id, '2026-03-05')).returnedOn).toBe(
      '2026-03-05',
    );

    await library.deleteBook(alice, book.id);
    const all = await lending.listLoans(alice, ALL);
    expect(all.items.map((loan) => loan.id)).toEqual(
      expect.arrayContaining([ofRemoved.id, ofBook.id]),
    );
    const rows = await loadLoanLedger(
      alice,
      { status: 'all', sort: 'recent', page: 1 },
      '2026-03-05',
    );
    const row = rows.rows.find(({ loan }) => loan.id === ofBook.id);
    expect(row).toMatchObject({ book: null, copy: null }); // shown as "no longer", never broken links
    expect((await lending.returnLoan(alice, ofBook.id, '2026-03-06')).returnedOn).toBe(
      '2026-03-06',
    );
  });

  it('another reader gets the same 404 for every foreign loan and copy, with no borrower details', async () => {
    const {
      copies: [copy],
    } = await physicalBookWithCopies(alice, 'Adam Bede', 1);
    const loan = await lending.createLoan(alice, copy!.id, {
      borrowerName: 'Secret Borrower',
      borrowerContact: 'secret@example.test',
      lentOn: '2026-03-01',
    });
    for (const attempt of [
      () => lending.getLoan(bob, loan.id),
      () => lending.updateLoan(bob, loan.id, { note: 'mine' }),
      () => lending.returnLoan(bob, loan.id, '2026-03-02'),
      () => lending.getCopyLoanOverview(bob, copy!.id),
      () => lending.listCopyLoans(bob, copy!.id, ALL),
      () => lending.createLoan(bob, copy!.id, { borrowerName: 'Bob', lentOn: '2026-03-02' }),
    ]) {
      const error = await apiError(attempt());
      expect(error.status).toBe(404);
      expect(JSON.stringify(error)).not.toMatch(/Secret Borrower|secret@example/);
    }
    expect((await lending.listLoans(bob, ALL)).items.map((l) => l.id)).not.toContain(loan.id);
  });
});

describe('dashboard', () => {
  it('derives every count on the server, keeping deleted books out and their loans in', async () => {
    const { api: carol } = await newReader();
    const physical = await physicalBookWithCopies(carol, 'Persuasion', 2);
    const other = await physicalBookWithCopies(carol, 'Emma', 1);
    const ebook = await library.createBook(carol, { title: 'Dune', format: 'ebook' });
    // Persuasion: read once, now rereading. Dune: finished. Emma: never read.
    const firstRead = await reading.startSession(carol, physical.book.id, {});
    await reading.updateSession(carol, firstRead.id, { status: 'completed' });
    await reading.startSession(carol, physical.book.id, {});
    await reading.startSession(carol, ebook.id, { status: 'completed' });
    await notes.createNote(carol, physical.book.id, { kind: 'note', content: 'A note' });
    await notes.createNote(carol, ebook.id, { kind: 'highlight', content: 'A quote' });
    await library.createWish(carol, { title: 'Wanted', priority: 'medium' });
    const acquired = await library.createWish(carol, { title: 'Got it', priority: 'low' });
    await library.acquireWish(carol, acquired.id, ebook.id);
    const overdue = await lending.createLoan(carol, physical.copies[0]!.id, {
      borrowerName: 'Borrower Late',
      lentOn: '2026-01-01',
      dueOn: '2026-01-10',
    });
    const returned = await lending.createLoan(carol, physical.copies[1]!.id, {
      borrowerName: 'Borrower Back',
      lentOn: '2026-01-01',
    });
    await lending.returnLoan(carol, returned.id, '2026-01-02');
    await lending.createLoan(carol, other.copies[0]!.id, {
      borrowerName: 'Borrower Gone',
      lentOn: '2026-01-01',
    });
    await library.deleteBook(carol, other.book.id); // its loan still counts; the book doesn't

    const summary = await dashboard.getSummary(carol, '2026-01-11');
    expect(summary).toEqual({
      asOf: '2026-01-11',
      catalogue: { totalBooks: 2, physicalBooks: 1, ebooks: 1, physicalCopies: 2 },
      reading: {
        unreadBooks: 0,
        currentlyReadingBooks: 1,
        completedBooks: 1,
        booksEverCompleted: 2,
        totalSessions: 3,
        completedSessions: 2,
        rereadSessions: 1,
      },
      notes: { notes: 1, highlights: 1 },
      wishlist: { wanted: 1, acquired: 1 },
      lending: { activeLoans: 2, overdueLoans: 1, returnedLoans: 1 },
    });
    expect((await dashboard.getSummary(carol, '2026-01-10')).lending.overdueLoans).toBe(0);

    const statistics = await dashboard.getReadingStatistics(carol);
    const { overall, byFormat } = statistics;
    expect(overall.books.total).toBe(byFormat.physical.books.total + byFormat.ebook.books.total);
    expect(overall.sessions.total).toBe(
      byFormat.physical.sessions.total + byFormat.ebook.sessions.total,
    );
    expect(byFormat.physical.sessions.rereads).toBe(1);

    const activity = await dashboard.getRecentActivity(carol, 20);
    expect(new Set(activity.map((item) => item.type))).toEqual(
      new Set([
        'book_added',
        'reading_session_recorded',
        'note_added',
        'highlight_added',
        'wishlist_item_added',
        'loan_recorded',
      ]),
    );
    expect(activity.filter((item) => item.type === 'reading_session_recorded')).toHaveLength(3);
    expect(activity.some((item) => item.resourceId === overdue.id)).toBe(true);
    const items = await loadRecentActivity(carol);
    expect(items).toHaveLength(10);
    const goneLoan = (await loadRecentActivity(carol)).find(
      (item) => item.activity.type === 'loan_recorded' && item.bookGone,
    );
    expect(goneLoan?.href).toMatch(/^\/lending\/[0-9a-f]{24}$/);
    expect(JSON.stringify(items)).not.toMatch(/Borrower/); // no borrower names in the feed
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

  function request(method: LibraryMethod, body?: unknown) {
    return new NextRequest(`${ORIGIN}/api/x`, {
      method,
      headers: {
        cookie: `__Host-avuneri_session=${cookie}`,
        origin: ORIGIN,
        'sec-fetch-site': 'same-origin',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  it('records, conflicts, edits and returns with mapped codes', async () => {
    const {
      copies: [copy],
    } = await physicalBookWithCopies(alice, 'Pipeline', 1);
    const body = { borrowerName: 'Ada', lentOn: '2026-03-01' };
    const created = await handleLibraryOperation(
      request('POST', body),
      runtime,
      { copyId: copy!.id },
      'POST',
      createLoan,
    );
    expect(created.status).toBe(201);
    const { data: loan } = await created.json();
    const twice = await handleLibraryOperation(
      request('POST', body),
      runtime,
      { copyId: copy!.id },
      'POST',
      createLoan,
    );
    expect((await twice.json()).error.code).toBe('COPY_ALREADY_ON_LOAN');

    const reopen = await handleLibraryOperation(
      request('PATCH', { returnedOn: null }),
      runtime,
      { loanId: loan.id },
      'PATCH',
      updateLoan,
    );
    expect(reopen.status).toBe(400);
    const back = await handleLibraryOperation(
      request('PUT', { returnedOn: '2026-03-02' }),
      runtime,
      { loanId: loan.id },
      'PUT',
      returnLoan,
    );
    expect((await back.json()).data.returnedOn).toBe('2026-03-02');
    const otherDay = await handleLibraryOperation(
      request('PUT', { returnedOn: '2026-03-03' }),
      runtime,
      { loanId: loan.id },
      'PUT',
      returnLoan,
    );
    expect(otherDay.status).toBe(409);
    expect((await otherDay.json()).error.code).toBe('LOAN_ALREADY_RETURNED');
  });
});
