// A local stand-in for the Book Tracker API's /api/v1/auth endpoints, used only by Playwright.
// It follows the API's token semantics: single-use refresh tokens, reuse detection that revokes
// the session (refresh and logout alike), an absolute session lifetime and access tokens bound to
// a live session. Behaviour is selected per reader by markers in the email address, so parallel
// tests never interfere:
//   +fastrefresh   access tokens live 2 s (every request refreshes); slow refresh responses
//   +shortsession  the session ends after 8 s
//   outage@...     login drops the connection (network failure)
//   ratelimited@   login answers 429 with Retry-After: 90
// Every library, reading, notes, lending and dashboard endpoint answers 503, so outage handling
// can be tested, except one healthy book (HEALTHY_BOOK_ID, with no groups), so a book page whose
// reading and notes sections are down can be shown, and, for readers whose email contains
// +summaryok, a healthy dashboard summary, so Home with one section up and the others down can be.
// Test-only endpoints under /__test are served on loopback only.
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';

const port = Number(process.env.FAKE_API_PORT ?? 3901);
const users = new Map(); // email -> user
const sessions = new Map(); // id -> { email, expiresAt, revoked }
const refreshTokens = new Map(); // token -> { sessionId, status }
const accessTokens = new Map(); // token -> { sessionId, expiresAt }
const statsByEmail = new Map();

const token = () => randomBytes(24).toString('base64url');
const statsOf = (email) => {
  if (!statsByEmail.has(email))
    statsByEmail.set(email, { refreshCalls: 0, reuseDetected: 0, tokens: [] });
  return statsByEmail.get(email);
};
const isLive = (sessionId) => {
  const session = sessions.get(sessionId);
  return Boolean(session && !session.revoked && session.expiresAt > Date.now());
};

function issueTokens(sessionId) {
  const session = sessions.get(sessionId);
  const ttl = session.email.includes('+fastrefresh') ? 2 : 900;
  const accessToken = token();
  const refreshToken = token();
  accessTokens.set(accessToken, { sessionId, expiresAt: Date.now() + ttl * 1000 });
  refreshTokens.set(refreshToken, { sessionId, status: 'active' });
  statsOf(session.email).tokens.push(accessToken, refreshToken);
  return {
    accessToken,
    refreshToken,
    tokenType: 'Bearer',
    expiresIn: ttl,
    refreshExpiresIn: Math.max(1, Math.ceil((session.expiresAt - Date.now()) / 1000)),
  };
}

function signIn(user) {
  const sessionId = token();
  const lifetime = user.email.includes('+shortsession') ? 8_000 : 30 * 24 * 3600 * 1000;
  sessions.set(sessionId, { email: user.email, expiresAt: Date.now() + lifetime, revoked: false });
  return { user: publicUser(user), tokens: issueTokens(sessionId) };
}

const publicUser = ({ id, name, email, createdAt }) => ({ id, name, email, createdAt });

function send(response, status, body, headers = {}) {
  const requestId = randomBytes(8).toString('hex');
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'X-Request-Id': requestId,
    ...(body === undefined ? {} : { 'Content-Type': 'application/json; charset=utf-8' }),
    ...headers,
  });
  response.end(body === undefined ? undefined : JSON.stringify(body));
}

const fail = (response, status, code, message, headers) =>
  send(response, status, { error: { code, message } }, headers);

function rejectRefreshToken(response, presented) {
  const record = refreshTokens.get(presented);
  if (record?.status === 'consumed') {
    const session = sessions.get(record.sessionId);
    if (session) {
      session.revoked = true;
      statsOf(session.email).reuseDetected += 1;
    }
  }
  fail(response, 401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid, expired or revoked');
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    return undefined;
  }
}

const routes = {
  'POST /api/v1/auth/register': async (request, response) => {
    const { name, email, password } = (await readJson(request)) ?? {};
    if (
      typeof name !== 'string' ||
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      password.length < 12
    ) {
      return fail(response, 400, 'VALIDATION_ERROR', 'The request contains invalid fields');
    }
    if (users.has(email))
      return fail(response, 409, 'CONFLICT', 'An account with this email already exists');
    const user = {
      id: randomBytes(12).toString('hex'),
      name,
      email,
      password,
      createdAt: new Date().toISOString(),
    };
    users.set(email, user);
    send(response, 201, { data: signIn(user) });
  },

  'POST /api/v1/auth/login': async (request, response) => {
    const { email, password } = (await readJson(request)) ?? {};
    if (typeof email === 'string' && email.startsWith('outage@')) return request.socket.destroy();
    if (typeof email === 'string' && email.startsWith('ratelimited@')) {
      return fail(response, 429, 'RATE_LIMITED', 'Too many requests, try again later', {
        'Retry-After': '90',
      });
    }
    const user = users.get(email);
    if (!user || user.password !== password) {
      return fail(response, 401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
    }
    send(response, 200, { data: signIn(user) });
  },

  'POST /api/v1/auth/refresh': async (request, response) => {
    const { refreshToken } = (await readJson(request)) ?? {};
    const record = refreshTokens.get(refreshToken);
    const session = record && sessions.get(record.sessionId);
    if (session) statsOf(session.email).refreshCalls += 1;
    if (!record || record.status !== 'active' || !isLive(record.sessionId)) {
      return rejectRefreshToken(response, refreshToken);
    }
    record.status = 'consumed';
    const tokens = issueTokens(record.sessionId);
    if (session.email.includes('+fastrefresh')) await sleep(250);
    send(response, 200, { data: { tokens } });
  },

  'POST /api/v1/auth/logout': async (request, response) => {
    const { refreshToken } = (await readJson(request)) ?? {};
    const record = refreshTokens.get(refreshToken);
    if (!record || record.status !== 'active' || !isLive(record.sessionId)) {
      return rejectRefreshToken(response, refreshToken);
    }
    sessions.get(record.sessionId).revoked = true;
    send(response, 204);
  },

  'GET /api/v1/auth/me': async (request, response) => {
    const presented = /^Bearer (.+)$/.exec(request.headers.authorization ?? '')?.[1];
    const record = accessTokens.get(presented);
    if (!record || record.expiresAt <= Date.now() || !isLive(record.sessionId)) {
      return fail(response, 401, 'UNAUTHENTICATED', 'A valid access token is required', {
        'WWW-Authenticate': 'Bearer',
      });
    }
    send(response, 200, {
      data: { user: publicUser(users.get(sessions.get(record.sessionId).email)) },
    });
  },

  'GET /__test/health': async (_request, response) =>
    send(response, 200, { data: { status: 'ok' } }),

  'GET /__test/stats': async (request, response) => {
    const email = new URL(request.url, 'http://x').searchParams.get('email');
    const { refreshCalls, reuseDetected, tokens } = statsOf(email);
    send(response, 200, { data: { refreshCalls, reuseDetected, tokens } });
  },

  'POST /__test/revoke': async (request, response) => {
    const { email } = (await readJson(request)) ?? {};
    for (const session of sessions.values()) if (session.email === email) session.revoked = true;
    send(response, 204);
  },

  // A page on another site that tries to sign the visitor out with a cross-site form post.
  'GET /__test/csrf-form': async (request, response) => {
    const target = new URL(request.url, 'http://x').searchParams.get('target') ?? '';
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html><title>Elsewhere</title>
      <form id="f" method="post" enctype="text/plain" action="${target.replace(/"/g, '')}">
        <input name='{"x":"' value='"}'>
      </form>
      <script>document.getElementById('f').submit()</script>`);
  },
};

const LIBRARY_PATHS =
  /^\/api\/v1\/(books|copies|locations|categories|collections|wishlist|reading-sessions|notes|loans|dashboard)(\/|$)/;
const HEALTHY_BOOK_ID = '0000000000000000000000b0';
const EPOCH = '2026-01-01T00:00:00.000Z';
const EMPTY_PAGE = {
  data: [],
  meta: { pagination: { page: 1, limit: 100, total: 0, totalPages: 0 } },
};
const HEALTHY = {
  [`/api/v1/books/${HEALTHY_BOOK_ID}`]: {
    data: {
      id: HEALTHY_BOOK_ID,
      title: 'A Healthy Book',
      authors: ['Test Author'],
      format: 'ebook',
      createdAt: EPOCH,
      updatedAt: EPOCH,
    },
  },
  [`/api/v1/books/${HEALTHY_BOOK_ID}/organization`]: {
    data: { bookId: HEALTHY_BOOK_ID, categories: [], collections: [] },
  },
  '/api/v1/categories': EMPTY_PAGE,
  '/api/v1/collections': EMPTY_PAGE,
};

const HEALTHY_SUMMARY = {
  data: {
    asOf: '2026-11-16',
    catalogue: { totalBooks: 3, physicalBooks: 2, ebooks: 1, physicalCopies: 4 },
    reading: {
      unreadBooks: 1,
      currentlyReadingBooks: 1,
      completedBooks: 1,
      booksEverCompleted: 2,
      totalSessions: 4,
      completedSessions: 2,
      rereadSessions: 1,
    },
    notes: { notes: 5, highlights: 2 },
    wishlist: { wanted: 2, acquired: 1 },
    lending: { activeLoans: 2, overdueLoans: 1, returnedLoans: 3 },
  },
};

function readerEmail(request) {
  const presented = /^Bearer (.+)$/.exec(request.headers.authorization ?? '')?.[1];
  const record = accessTokens.get(presented);
  return record ? sessions.get(record.sessionId)?.email : undefined;
}

createServer((request, response) => {
  const path = new URL(request.url, 'http://x').pathname;
  if (request.method === 'GET' && HEALTHY[path]) return send(response, 200, HEALTHY[path]);
  if (
    request.method === 'GET' &&
    path === '/api/v1/dashboard/summary' &&
    readerEmail(request)?.includes('+summaryok')
  ) {
    return send(response, 200, HEALTHY_SUMMARY);
  }
  if (LIBRARY_PATHS.test(path)) {
    return fail(
      response,
      503,
      'SERVICE_UNAVAILABLE',
      'Service is not ready: database is not connected',
    );
  }
  const route = routes[`${request.method} ${path}`];
  if (!route) return fail(response, 404, 'NOT_FOUND', 'Route not found');
  route(request, response).catch(() =>
    fail(response, 500, 'INTERNAL_ERROR', 'An unexpected error occurred'),
  );
}).listen(port, '127.0.0.1', () => console.log(`Fake auth API listening on 127.0.0.1:${port}`));
