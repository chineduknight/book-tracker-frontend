// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import { createFakeBackendAuth, type FakeBackendAuth } from '@/test/fixtures/fake-backend-auth';
import { createMemorySessionStore } from '@/test/fixtures/memory-session-store';
import type { BffConfig } from '../config';
import { createSessionService } from '../session/session-service';
import type { SessionStore } from '../session/session-store';
import type { BffRuntime } from '../session/session-runtime';
import { createTokenVault } from '../session/token-vault';
import { handleCurrentUser, handleLogin, handleLogout, handleRegister } from './session-handlers';

const HTTPS_ORIGIN = 'https://avuneri.example';
const LOCAL_ORIGIN = 'http://localhost:3100';
const PASSWORD = 'a long enough passphrase';

let fake: FakeBackendAuth;
let store: ReturnType<typeof createMemorySessionStore>;

function runtimeFor(appOrigin: string, storeOverride?: SessionStore): BffRuntime {
  const config: BffConfig = {
    apiBaseUrl: 'https://api.avuneri.example/api/v1',
    appOrigin,
    isHttps: appOrigin.startsWith('https://'),
    sessionStore: {
      uri: 'mongodb://127.0.0.1/avuneri-bff',
      databaseName: 'avuneri-bff',
      requiresTls: false,
    },
    sessionMasterKey: randomBytes(32),
  };
  const sessions = createSessionService({
    store: storeOverride ?? store,
    backend: fake.backend,
    vault: createTokenVault(config.sessionMasterKey),
  });
  return { config, sessions, backend: fake.backend };
}

function post(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
  appOrigin = HTTPS_ORIGIN,
): NextRequest {
  return new NextRequest(`${appOrigin}${path}`, {
    method: 'POST',
    headers: {
      origin: appOrigin,
      'content-type': 'application/json',
      'sec-fetch-site': 'same-origin',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function setCookieOf(response: Response): string {
  return response.headers.get('set-cookie') ?? '';
}

function cookieValueOf(response: Response): string {
  return /=([^;]*)/.exec(setCookieOf(response))?.[1] ?? '';
}

async function registeredReader(runtime: BffRuntime, email = 'ada@example.com') {
  const response = await handleRegister(
    post('/api/session/register', { name: 'Ada Lovelace', email, password: PASSWORD }),
    runtime,
  );
  return { response, cookie: cookieValueOf(response) };
}

beforeEach(() => {
  fake = createFakeBackendAuth();
  store = createMemorySessionStore();
});

describe('register and login', () => {
  it('sets a __Host- HttpOnly Secure SameSite=Lax cookie and returns only a safe profile', async () => {
    const runtime = runtimeFor(HTTPS_ORIGIN);
    const { response } = await registeredReader(runtime);

    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      data: { user: { name: 'Ada Lovelace', email: 'ada@example.com' } },
    });
    const cookie = setCookieOf(response);
    expect(cookie).toMatch(/^__Host-avuneri_session=[A-Za-z0-9_-]{43};/);
    expect(cookie).toMatch(/; HttpOnly/i);
    expect(cookie).toMatch(/; Secure/i);
    expect(cookie).toMatch(/; SameSite=lax/i);
    expect(cookie).toMatch(/; Path=\//);
    expect(cookie).not.toMatch(/Domain=/i);
    const expires = new Date(/Expires=([^;]+)/i.exec(cookie)?.[1] ?? '').getTime();
    expect(expires).toBeGreaterThan(Date.now() + 29 * 24 * 3600 * 1000);
    expect(expires).toBeLessThanOrEqual(Date.now() + 30 * 24 * 3600 * 1000 + 1000);
  });

  it('uses a distinct, non-Secure cookie only for a loopback http origin', async () => {
    const response = await handleLogin(
      post('/api/session/login', { email: 'nobody@example.com', password: 'x' }, {}, LOCAL_ORIGIN),
      runtimeFor(LOCAL_ORIGIN),
    );
    expect(response.status).toBe(401);

    await fake.signUp('ada@example.com');
    const signedIn = await handleLogin(
      post(
        '/api/session/login',
        { email: ' ADA@example.com ', password: PASSWORD },
        {},
        LOCAL_ORIGIN,
      ),
      runtimeFor(LOCAL_ORIGIN),
    );
    expect(signedIn.status).toBe(200);
    expect(setCookieOf(signedIn)).toMatch(/^avuneri_session_local=/);
    expect(setCookieOf(signedIn)).not.toMatch(/Secure/i);
    expect(setCookieOf(signedIn)).toMatch(/HttpOnly/i);
  });

  it('never exposes backend tokens in the response', async () => {
    const register = vi.spyOn(fake.backend, 'register');
    const { response } = await registeredReader(runtimeFor(HTTPS_ORIGIN));
    const { tokens } = await register.mock.results[0]!.value;
    const exposed = `${JSON.stringify(await response.json())} ${JSON.stringify([...response.headers])}`;
    expect(exposed).not.toContain(tokens.accessToken);
    expect(exposed).not.toContain(tokens.refreshToken);
  });

  it('issues a new session on every sign-in and ends the one it replaces', async () => {
    const runtime = runtimeFor(HTTPS_ORIGIN);
    const { cookie: first } = await registeredReader(runtime);
    const second = await handleLogin(
      post(
        '/api/session/login',
        { email: 'ada@example.com', password: PASSWORD },
        { cookie: `__Host-avuneri_session=${first}` },
      ),
      runtime,
    );
    expect(cookieValueOf(second)).not.toBe(first);
    expect(store.records.size).toBe(1);
    await expect(runtime.sessions.accessTokenFor(first)).rejects.toMatchObject({
      reason: 'missing',
    });
  });

  it('validates on the server with the backend rules, without calling the API', async () => {
    const register = vi.spyOn(fake.backend, 'register');
    const response = await handleRegister(
      post('/api/session/register', { name: ' ', email: 'not-an-email', password: 'short' }),
      runtimeFor(HTTPS_ORIGIN),
    );
    expect(response.status).toBe(400);
    const { error } = await response.json();
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.fields.map((field: { field: string }) => field.field).sort()).toEqual([
      'email',
      'name',
      'password',
    ]);
    expect(JSON.stringify(error)).not.toContain('not-an-email');
    expect(register).not.toHaveBeenCalled();
  });

  it('rejects unknown fields and never trims passwords', async () => {
    const unknown = await handleLogin(
      post('/api/session/login', { email: 'ada@example.com', password: 'x', ownerId: 'evil' }),
      runtimeFor(HTTPS_ORIGIN),
    );
    expect((await unknown.json()).error.message).toMatch(/unexpected/);

    const tooShort = await handleRegister(
      post('/api/session/register', {
        name: 'Ada',
        email: 'a@example.com',
        password: '   short    ',
      }),
      runtimeFor(HTTPS_ORIGIN),
    );
    expect(tooShort.status).toBe(201);
  });

  it.each([
    [
      new ApiError({ status: 401, code: 'INVALID_CREDENTIALS', message: 'x' }),
      401,
      'INVALID_CREDENTIALS',
    ],
    [new ApiError({ status: 409, code: 'CONFLICT', message: 'x' }), 409, 'EMAIL_TAKEN'],
    [
      new ApiError({ status: 500, code: 'INTERNAL_ERROR', message: 'db exploded at 10.0.0.3' }),
      503,
      'SERVICE_UNAVAILABLE',
    ],
    [
      new ApiError({ status: 503, code: 'SERVICE_UNAVAILABLE', message: 'x' }),
      503,
      'SERVICE_UNAVAILABLE',
    ],
    [new TypeError('fetch failed ECONNREFUSED 10.0.0.3'), 503, 'SERVICE_UNAVAILABLE'],
  ])('maps a backend failure to a safe response (%#)', async (failure, status, code) => {
    vi.spyOn(fake.backend, 'login').mockRejectedValue(failure);
    const response = await handleLogin(
      post('/api/session/login', { email: 'ada@example.com', password: PASSWORD }),
      runtimeFor(HTTPS_ORIGIN),
    );
    expect(response.status).toBe(status);
    const body = JSON.stringify(await response.json());
    expect(body).toContain(code);
    expect(body).not.toContain('10.0.0.3');
    expect(setCookieOf(response)).toBe('');
  });

  it('relays rate limiting with Retry-After', async () => {
    vi.spyOn(fake.backend, 'login').mockRejectedValue(
      new ApiError({ status: 429, code: 'RATE_LIMITED', message: 'x', retryAfterSeconds: 120 }),
    );
    const response = await handleLogin(
      post('/api/session/login', { email: 'ada@example.com', password: PASSWORD }),
      runtimeFor(HTTPS_ORIGIN),
    );
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('120');
    expect((await response.json()).error).toMatchObject({
      code: 'RATE_LIMITED',
      retryAfterSeconds: 120,
    });
  });

  it('revokes the new backend session when the session store cannot save it', async () => {
    const failing: SessionStore = {
      ...store,
      insert: async () => {
        throw new Error('store down');
      },
    };
    const register = vi.spyOn(fake.backend, 'register');
    const response = await handleRegister(
      post('/api/session/register', { name: 'Ada', email: 'ada@example.com', password: PASSWORD }),
      runtimeFor(HTTPS_ORIGIN, failing),
    );
    expect(response.status).toBe(503);
    expect(setCookieOf(response)).toBe('');
    const { tokens } = await register.mock.results[0]!.value;
    expect(fake.isSessionLiveFor(tokens.refreshToken)).toBe(false);
  });
});

describe('CSRF and request hygiene', () => {
  const credentials = { email: 'ada@example.com', password: PASSWORD };

  it.each([
    ['a missing Origin', { origin: '' }],
    ['a null Origin', { origin: 'null' }],
    ['a foreign Origin', { origin: 'https://evil.example' }],
    ['a look-alike Origin', { origin: 'https://avuneri.example.evil.example' }],
    ['an http downgrade of the Origin', { origin: 'http://avuneri.example' }],
    [
      'forged Host and X-Forwarded-Host with a matching foreign Origin',
      {
        origin: 'https://evil.example',
        host: 'evil.example',
        'x-forwarded-host': 'evil.example',
        'x-forwarded-proto': 'https',
      },
    ],
    ['a cross-site fetch', { 'sec-fetch-site': 'cross-site' }],
    ['a same-site (sibling subdomain) fetch', { 'sec-fetch-site': 'same-site' }],
  ])('refuses %s', async (_name, headers: Record<string, string>) => {
    const login = vi.spyOn(fake.backend, 'login');
    const request = post('/api/session/login', credentials, headers);
    if (headers['origin'] === '') request.headers.delete('origin');
    const response = await handleLogin(request, runtimeFor(HTTPS_ORIGIN));
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('FORBIDDEN_ORIGIN');
    expect(login).not.toHaveBeenCalled();
  });

  it.each([
    ['a form post', 'application/x-www-form-urlencoded', 'email=a&password=b'],
    ['multipart', 'multipart/form-data; boundary=x', '--x--'],
    ['plain text', 'text/plain', JSON.stringify({ email: 'a@example.com', password: 'b' })],
  ])('refuses %s even from the right origin', async (_name, contentType, body) => {
    const response = await handleLogin(
      post('/api/session/login', body, { 'content-type': contentType }),
      runtimeFor(HTTPS_ORIGIN),
    );
    expect(response.status).toBe(415);
  });

  it('refuses oversized bodies, with or without a Content-Length', async () => {
    const huge = JSON.stringify({ email: 'a@example.com', password: 'p'.repeat(20_000) });
    const declared = await handleLogin(
      post('/api/session/login', huge, { 'content-length': String(huge.length) }),
      runtimeFor(HTTPS_ORIGIN),
    );
    expect(declared.status).toBe(413);
    const streamed = await handleLogin(post('/api/session/login', huge), runtimeFor(HTTPS_ORIGIN));
    expect(streamed.status).toBe(413);
  });

  it('refuses malformed JSON', async () => {
    const response = await handleLogin(
      post('/api/session/login', '{"email":'),
      runtimeFor(HTTPS_ORIGIN),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('INVALID_JSON');
  });

  it('protects logout too, so a foreign site cannot sign a reader out', async () => {
    const runtime = runtimeFor(HTTPS_ORIGIN);
    const { cookie } = await registeredReader(runtime);
    const response = await handleLogout(
      post(
        '/api/session/logout',
        {},
        { origin: 'https://evil.example', cookie: `__Host-avuneri_session=${cookie}` },
      ),
      runtime,
    );
    expect(response.status).toBe(403);
    await expect(runtime.sessions.accessTokenFor(cookie)).resolves.toBeDefined();
  });
});

describe('logout', () => {
  it('ends the session everywhere and deletes the cookie with matching attributes', async () => {
    const runtime = runtimeFor(HTTPS_ORIGIN);
    const { cookie } = await registeredReader(runtime);
    const response = await handleLogout(
      post('/api/session/logout', {}, { cookie: `__Host-avuneri_session=${cookie}` }),
      runtime,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { backendSignOut: 'confirmed' } });
    const cleared = setCookieOf(response);
    expect(cleared).toMatch(/^__Host-avuneri_session=;/);
    expect(cleared).toMatch(/Max-Age=0/i);
    expect(cleared).toMatch(/Path=\//);
    expect(cleared).toMatch(/Secure/i);
    expect(cleared).toMatch(/HttpOnly/i);
    expect(fake.stats.logoutCalls).toBe(1);
    await expect(runtime.sessions.accessTokenFor(cookie)).rejects.toMatchObject({
      reason: 'missing',
    });
  });

  it('is harmless without a session', async () => {
    const response = await handleLogout(post('/api/session/logout', {}), runtimeFor(HTTPS_ORIGIN));
    await expect(response.json()).resolves.toEqual({ data: { backendSignOut: 'not-needed' } });
    expect(setCookieOf(response)).toMatch(/Max-Age=0/i);
  });

  it('still removes the cookie when the session store is down, and says so', async () => {
    const failing: SessionStore = {
      ...store,
      deleteByVerifier: async () => {
        throw new Error('store down');
      },
    };
    const response = await handleLogout(
      post('/api/session/logout', {}, { cookie: `__Host-avuneri_session=${'a'.repeat(43)}` }),
      runtimeFor(HTTPS_ORIGIN, failing),
    );
    expect(response.status).toBe(503);
    expect((await response.json()).error.message).toMatch(/signed out on this device/);
    expect(setCookieOf(response)).toMatch(/Max-Age=0/i);
  });
});

describe('current user', () => {
  it('returns the safe profile for a valid session', async () => {
    const runtime = runtimeFor(HTTPS_ORIGIN);
    const { cookie } = await registeredReader(runtime);
    const response = await handleCurrentUser(
      new NextRequest(`${HTTPS_ORIGIN}/api/session/me`, {
        headers: { cookie: `__Host-avuneri_session=${cookie}` },
      }),
      runtime,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      data: { user: { name: 'Ada Lovelace', email: 'ada@example.com' } },
    });
    expect(setCookieOf(response)).toBe('');
  });

  it.each([
    ['no cookie', undefined],
    ['a forged cookie', 'forged'],
    ['an unknown well-formed cookie', 'b'.repeat(43)],
  ])('answers 401 for %s, creating nothing', async (_name, value) => {
    const response = await handleCurrentUser(
      new NextRequest(`${HTTPS_ORIGIN}/api/session/me`, {
        headers: value ? { cookie: `__Host-avuneri_session=${value}` } : {},
      }),
      runtimeFor(HTTPS_ORIGIN),
    );
    expect(response.status).toBe(401);
    expect(store.records.size).toBe(0);
  });

  it('ignores the session cookie under the wrong (non-__Host-) name on an https origin', async () => {
    const runtime = runtimeFor(HTTPS_ORIGIN);
    const { cookie } = await registeredReader(runtime);
    const response = await handleCurrentUser(
      new NextRequest(`${HTTPS_ORIGIN}/api/session/me`, {
        headers: { cookie: `avuneri_session_local=${cookie}` },
      }),
      runtime,
    );
    expect(response.status).toBe(401);
  });

  it('clears the cookie once the API has revoked the session', async () => {
    const runtime = runtimeFor(HTTPS_ORIGIN);
    const register = vi.spyOn(fake.backend, 'register');
    const { cookie } = await registeredReader(runtime);
    const { user } = await register.mock.results[0]!.value;
    fake.revokeAllSessionsOf(user.id);

    const response = await handleCurrentUser(
      new NextRequest(`${HTTPS_ORIGIN}/api/session/me`, {
        headers: { cookie: `__Host-avuneri_session=${cookie}` },
      }),
      runtime,
    );
    expect(response.status).toBe(401);
    expect(setCookieOf(response)).toMatch(/Max-Age=0/i);
  });
});
