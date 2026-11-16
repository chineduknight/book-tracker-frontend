// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeBackendAuth } from '@/test/fixtures/fake-backend-auth';
import { errorResponse as apiError, fakeFetch, jsonResponse } from '@/test/fixtures/fetch';
import { createMemorySessionStore } from '@/test/fixtures/memory-session-store';
import type { BffConfig } from '../config';
import {
  createLoan,
  getCopyLoanOverview,
  returnLoan,
  updateLoan,
} from '../lending/lending-operations';
import { createSessionService } from '../session/session-service';
import type { BffRuntime } from '../session/session-runtime';
import { createTokenVault } from '../session/token-vault';
import { handleLibraryOperation, type LibraryMethod, type LibraryOperation } from './library-route';

const ORIGIN = 'https://avuneri.example';
const API = 'https://api.avuneri.example/api/v1';
const COPY_ID = '665f1c2ab4e5d1a2b3c4d5e6';
const LOAN_ID = '665f1c2ab4e5d1a2b3c4d5e7';
const NOW = '2026-11-15T10:00:00.000Z';
const LOAN = {
  id: LOAN_ID,
  copyId: COPY_ID,
  bookId: '665f1c2ab4e5d1a2b3c4d5e8',
  borrowerName: 'Ada',
  lentOn: '2026-03-01',
  returnedOn: null,
  createdAt: NOW,
  updatedAt: NOW,
};
const NEW_LOAN = { borrowerName: 'Ada', lentOn: '2026-03-01' };

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

describe('origin and session checks on every lending write', () => {
  const cases: Array<[string, LibraryMethod, (req: NextRequest) => Promise<Response>, unknown]> = [
    ['record a loan', 'POST', (req) => run('POST', createLoan, req, { copyId: COPY_ID }), NEW_LOAN],
    [
      'edit a loan',
      'PATCH',
      (req) => run('PATCH', updateLoan, req, { loanId: LOAN_ID }),
      { note: 'x' },
    ],
    [
      'return a loan',
      'PUT',
      (req) => run('PUT', returnLoan, req, { loanId: LOAN_ID }),
      { returnedOn: '2026-03-10' },
    ],
  ];

  it.each(cases)(
    '%s refuses a foreign origin before calling the API',
    async (_n, method, send, body) => {
      const { fetchImpl } = backend();
      const response = await send(
        request(method, { body, headers: { origin: 'https://evil.example' } }),
      );
      expect(response.status).toBe(403);
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );

  it.each(cases)('%s refuses a cross-site fetch', async (_n, method, send, body) => {
    const { fetchImpl } = backend();
    const response = await send(
      request(method, { body, headers: { 'sec-fetch-site': 'cross-site' } }),
    );
    expect(response.status).toBe(403);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each(cases)(
    '%s refuses an anonymous caller before calling the API',
    async (_n, method, send, body) => {
      const { fetchImpl } = backend();
      const response = await send(
        new NextRequest(`${ORIGIN}/api/x`, {
          method,
          headers: {
            origin: ORIGIN,
            'sec-fetch-site': 'same-origin',
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
        }),
      );
      expect(response.status).toBe(401);
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );

  it('refuses a malformed copy id before anything else', async () => {
    const { fetchImpl } = backend();
    const response = await run('POST', createLoan, request('POST', { body: NEW_LOAN }), {
      copyId: '../../loans',
    });
    expect(response.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('strict loan bodies', () => {
  it.each([
    ['a return day on create', { ...NEW_LOAN, returnedOn: '2026-03-02' }],
    ['a client-chosen bookId', { ...NEW_LOAN, bookId: COPY_ID }],
    ['a status', { ...NEW_LOAN, status: 'active' }],
    ['no lent day', { borrowerName: 'Ada' }],
    ['a blank borrower', { borrowerName: '   ', lentOn: '2026-03-01' }],
    ['an impossible day', { borrowerName: 'Ada', lentOn: '2027-02-29' }],
    ['a timestamp', { borrowerName: 'Ada', lentOn: '2026-03-01T00:00:00Z' }],
    ['a null contact on create', { ...NEW_LOAN, borrowerContact: null }],
    ['a 161-character borrower', { borrowerName: 'x'.repeat(161), lentOn: '2026-03-01' }],
    ['a 2,001-character note', { ...NEW_LOAN, note: 'x'.repeat(2_001) }],
  ])('refuses %s when recording a loan', async (_name, body) => {
    const { fetchImpl } = backend();
    const response = await run('POST', createLoan, request('POST', { body }), { copyId: COPY_ID });
    expect(response.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ['an empty change', {}],
    ['reopening (returnedOn null)', { returnedOn: null }],
    ['a null borrower', { borrowerName: null }],
    ['a null lent day', { lentOn: null }],
    ['an unknown field', { copyId: COPY_ID }],
  ])('refuses %s when editing', async (_name, body) => {
    const { fetchImpl } = backend();
    const response = await run('PATCH', updateLoan, request('PATCH', { body }), {
      loanId: LOAN_ID,
    });
    expect(response.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ['no day', {}],
    ['an extra field', { returnedOn: '2026-03-10', note: 'x' }],
    ['a null day', { returnedOn: null }],
  ])('refuses %s when returning', async (_name, body) => {
    const { fetchImpl } = backend();
    const response = await run('PUT', returnLoan, request('PUT', { body }), { loanId: LOAN_ID });
    expect(response.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('forwards PATCH nulls exactly and a return as exactly { returnedOn }', async () => {
    const { calls } = backend(jsonResponse(200, { data: LOAN }), jsonResponse(200, { data: LOAN }));
    await run('PATCH', updateLoan, request('PATCH', { body: { dueOn: null, note: null } }), {
      loanId: LOAN_ID.toUpperCase(),
    });
    await run('PUT', returnLoan, request('PUT', { body: { returnedOn: '2028-02-29' } }), {
      loanId: LOAN_ID,
    });
    expect(calls()[0]?.url).toBe(`${API}/loans/${LOAN_ID}`);
    expect(JSON.parse(String(calls()[0]?.init.body))).toEqual({ dueOn: null, note: null });
    expect(calls()[1]?.url).toBe(`${API}/loans/${LOAN_ID}/return`);
    expect(calls()[1]?.init.method).toBe('PUT');
    expect(JSON.parse(String(calls()[1]?.init.body))).toEqual({ returnedOn: '2028-02-29' });
  });

  it('refuses parameters on the copy overview', async () => {
    const { fetchImpl } = backend();
    const response = await run(
      'GET',
      getCopyLoanOverview,
      request('GET', { search: '?status=all' }),
      {
        copyId: COPY_ID,
      },
    );
    expect(response.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('API outcomes', () => {
  it.each([
    [
      'COPY_ALREADY_ON_LOAN',
      'This copy is already lent. Check its current loan before recording another.',
    ],
    [
      'LOAN_ALREADY_RETURNED',
      'This loan was returned on a different date. To correct the recorded date, edit this returned loan.',
    ],
    [
      'LOAN_UPDATE_CONFLICT',
      'This loan changed elsewhere. Review the latest details before saving.',
    ],
  ])('maps 409 %s to a fixed message, never echoing borrower details', async (code, message) => {
    backend(apiError(409, code, 'upstream text with Ada and ada@example.test'));
    const response = await run(
      'PUT',
      returnLoan,
      request('PUT', { body: { returnedOn: '2026-03-10' } }),
      {
        loanId: LOAN_ID,
      },
    );
    expect(response.status).toBe(409);
    const text = await response.text();
    expect(JSON.parse(text).error).toEqual({ code, message });
    expect(text).not.toContain('ada@example.test');
  });

  it.each([
    ['Loan not found', 'Loan not found'],
    ['Copy not found', 'Copy not found'],
    ['Loan of Ada not found', 'Not found'],
  ])('passes only allowlisted 404 messages (%s)', async (upstream, shown) => {
    backend(apiError(404, 'NOT_FOUND', upstream));
    const response = await run('POST', createLoan, request('POST', { body: NEW_LOAN }), {
      copyId: COPY_ID,
    });
    expect(response.status).toBe(404);
    expect((await response.json()).error.message).toBe(shown);
  });

  it('keeps a rate limit distinct from an outage', async () => {
    backend(
      apiError(429, 'RATE_LIMITED', 'Too many'),
      apiError(503, 'SERVICE_UNAVAILABLE', 'down'),
    );
    const limited = await run('GET', getCopyLoanOverview, request('GET'), { copyId: COPY_ID });
    const down = await run('GET', getCopyLoanOverview, request('GET'), { copyId: COPY_ID });
    expect([limited.status, down.status]).toEqual([429, 503]);
  });

  it('refuses an overview whose flag contradicts its loan', async () => {
    backend(jsonResponse(200, { data: { copyId: COPY_ID, isOnLoan: false, activeLoan: LOAN } }));
    const response = await run('GET', getCopyLoanOverview, request('GET'), { copyId: COPY_ID });
    expect(response.status).toBe(503);
  });

  it('records a loan with exactly the validated body', async () => {
    const { calls } = backend(jsonResponse(201, { data: LOAN }));
    const response = await run(
      'POST',
      createLoan,
      request('POST', {
        body: { borrowerName: '  Ada  ', lentOn: '2026-03-01', dueOn: '2026-03-15' },
      }),
      { copyId: COPY_ID },
    );
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(calls()[0]?.url).toBe(`${API}/copies/${COPY_ID}/loans`);
    expect(JSON.parse(String(calls()[0]?.init.body))).toEqual({
      borrowerName: 'Ada',
      lentOn: '2026-03-01',
      dueOn: '2026-03-15',
    });
  });
});
