import { randomBytes } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFakeBackendAuth, type FakeBackendAuth } from '@/test/fixtures/fake-backend-auth';
import {
  assertDisposableDatabaseName,
  openDisposableDatabase,
  testServerUri,
  type DisposableDatabase,
} from '@/test/integration/disposable-database';
import { createMongoSessionStore, type SessionDocument } from './mongo-session-store';
import { SessionEndedError, SessionUnavailableError } from './session-errors';
import { createMissingSessionIndexes, SESSION_COLLECTION } from './session-indexes';
import { createSessionService, type SessionService, type SessionTiming } from './session-service';
import type { SessionStore } from './session-store';
import { createTokenVault } from './token-vault';

const MASTER_KEY = randomBytes(32);
const TIMING: SessionTiming = {
  accessTokenRefreshMarginMs: 60_000,
  refreshLeaseMs: 1_500,
  refreshPollIntervalMs: 20,
};

/** Real time plus an adjustable offset, shared by every instance like synchronised server clocks. */
const clock = {
  offsetMs: 0,
  now: () => new Date(Date.now() + clock.offsetMs),
  advance(ms: number) {
    clock.offsetMs += ms;
  },
};

interface AppInstance {
  sessions: SessionService;
  store: SessionStore;
  client: MongoClient;
}

let database: DisposableDatabase;
let fake: FakeBackendAuth;
let instances: AppInstance[];

/** One "server instance": its own MongoClient and services, sharing only the database. */
async function startInstance(
  storeOverride?: (store: SessionStore) => SessionStore,
): Promise<AppInstance> {
  const client = new MongoClient(database.uri, { serverSelectionTimeoutMS: 5_000 });
  await client.connect();
  const collection = client.db(database.name).collection<SessionDocument>(SESSION_COLLECTION);
  const baseStore = createMongoSessionStore(collection);
  const store = storeOverride ? storeOverride(baseStore) : baseStore;
  const sessions = createSessionService({
    store,
    backend: fake.backend,
    vault: createTokenVault(MASTER_KEY),
    now: clock.now,
    timing: TIMING,
  });
  const instance = { sessions, store, client };
  instances.push(instance);
  return instance;
}

function rawSessions() {
  return database.db.collection<SessionDocument>(SESSION_COLLECTION);
}

async function signedInSession(instance: AppInstance) {
  const signedIn = await fake.signUp();
  const started = await instance.sessions.startSession(signedIn, clock.now());
  return { ...started, signedIn };
}

/** Moves time past the access token's refresh margin, as if the reader came back later. */
function makeAccessTokenStale() {
  clock.advance(15 * 60 * 1000);
}

async function endedReason(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(SessionEndedError);
  return (error as SessionEndedError).reason;
}

beforeEach(async () => {
  clock.offsetMs = 0;
  instances = [];
  fake = createFakeBackendAuth({ sessionTtlSeconds: 30 * 24 * 3600 });
  database = await openDisposableDatabase();
  await createMissingSessionIndexes(rawSessions());
});

afterEach(async () => {
  await Promise.all(instances.map((instance) => instance.client.close()));
  await database.dispose();
});

describe('durable sessions', () => {
  it('serve the same session from a second, independent instance without refreshing', async () => {
    const [first, second] = [await startInstance(), await startInstance()];
    const { sessionSecret, signedIn } = await signedInSession(first);

    await expect(second.sessions.accessTokenFor(sessionSecret)).resolves.toMatchObject({
      accessToken: signedIn.tokens.accessToken,
    });
    await expect(second.sessions.currentUser(sessionSecret)).resolves.toMatchObject({
      email: signedIn.user.email,
    });
    expect(fake.stats.refreshCalls).toBe(0);
  });

  it('never stores tokens or the cookie value in plaintext', async () => {
    const instance = await startInstance();
    const { sessionSecret, signedIn } = await signedInSession(instance);
    makeAccessTokenStale();
    await instance.sessions.accessTokenFor(sessionSecret);

    const stored = JSON.stringify(await rawSessions().find().toArray());
    for (const secret of [
      sessionSecret,
      signedIn.tokens.accessToken,
      signedIn.tokens.refreshToken,
      ...fake.stats.refreshTokensPresented,
    ]) {
      expect(stored).not.toContain(secret);
    }
    expect(stored).not.toContain(signedIn.user.email);
  });

  it('keeps readers isolated: a session resolves only its own reader', async () => {
    const instance = await startInstance();
    const a = await signedInSession(instance);
    const b = await signedInSession(instance);

    await expect(instance.sessions.currentUser(a.sessionSecret)).resolves.toMatchObject({
      email: a.signedIn.user.email,
    });
    await expect(instance.sessions.currentUser(b.sessionSecret)).resolves.toMatchObject({
      email: b.signedIn.user.email,
    });
    expect(a.sessionSecret).not.toBe(b.sessionSecret);
    expect(
      await endedReason(instance.sessions.accessTokenFor(randomBytes(32).toString('base64url'))),
    ).toBe('missing');
    expect(await endedReason(instance.sessions.accessTokenFor('forged'))).toBe('missing');
  });

  it('ends at the absolute expiry, and refreshing never extends it', async () => {
    fake = createFakeBackendAuth({ sessionTtlSeconds: 3600 });
    const instance = await startInstance();
    const { sessionSecret, expiresAt } = await signedInSession(instance);

    makeAccessTokenStale();
    await instance.sessions.accessTokenFor(sessionSecret);
    const afterRefresh = await rawSessions().findOne();
    expect(afterRefresh?.sessionExpiresAt.getTime()).toBeLessThanOrEqual(expiresAt.getTime());

    clock.advance(3600 * 1000);
    expect(await endedReason(instance.sessions.accessTokenFor(sessionSecret))).toBe('missing');
  });

  it('ends a session whose record has been corrupted', async () => {
    const instance = await startInstance();
    const { sessionSecret } = await signedInSession(instance);
    await rawSessions().updateOne({}, { $set: { sealedAccessToken: 'v1.AAAA.BBBB.CCCC' } });

    expect(await endedReason(instance.sessions.accessTokenFor(sessionSecret))).toBe('corrupted');
  });
});

describe('refresh rotation', () => {
  it('sends exactly one refresh for 24 concurrent requests across two instances', async () => {
    fake.setRefreshDelay(150);
    const [first, second] = [await startInstance(), await startInstance()];
    const { sessionSecret, signedIn } = await signedInSession(first);
    makeAccessTokenStale();

    const results = await Promise.all(
      Array.from({ length: 24 }, (_, index) =>
        (index % 2 === 0 ? first : second).sessions.accessTokenFor(sessionSecret),
      ),
    );

    expect(fake.stats.refreshCalls).toBe(1);
    expect(fake.stats.reuseDetected).toBe(0);
    expect(fake.stats.refreshTokensPresented).toEqual([signedIn.tokens.refreshToken]);
    const tokens = new Set(results.map((result) => result.accessToken));
    expect(tokens.size).toBe(1);
    expect(tokens.has(signedIn.tokens.accessToken)).toBe(false);
    await expect(second.sessions.currentUser(sessionSecret)).resolves.toBeDefined();
  });

  it('never presents a refresh token twice over many rotations', async () => {
    const [first, second] = [await startInstance(), await startInstance()];
    const { sessionSecret } = await signedInSession(first);

    for (let round = 0; round < 5; round += 1) {
      makeAccessTokenStale();
      await Promise.all(
        Array.from({ length: 10 }, (_, index) =>
          (index % 2 === 0 ? first : second).sessions.accessTokenFor(sessionSecret),
        ),
      );
    }

    expect(fake.stats.refreshCalls).toBe(5);
    expect(new Set(fake.stats.refreshTokensPresented).size).toBe(5);
    expect(fake.stats.reuseDetected).toBe(0);
  });

  it.each([
    'timeout-after-rotation',
    'server-error-after-rotation',
    'network-before-send',
  ] as const)(
    'ends the session after an ambiguous refresh (%s) and never retries the old token',
    async (fault) => {
      const [first, second] = [await startInstance(), await startInstance()];
      const { sessionSecret, signedIn } = await signedInSession(first);
      makeAccessTokenStale();
      fake.failNextRefresh(fault);

      const outcomes = await Promise.allSettled(
        Array.from({ length: 8 }, (_, index) =>
          (index % 2 === 0 ? first : second).sessions.accessTokenFor(sessionSecret),
        ),
      );

      expect(outcomes.every((outcome) => outcome.status === 'rejected')).toBe(true);
      expect(fake.stats.refreshCalls).toBe(1);
      expect(fake.stats.refreshTokensPresented).toEqual([signedIn.tokens.refreshToken]);
      expect(await rawSessions().countDocuments()).toBe(0);
      // The cleanup logout ends the backend session whether or not the token had been consumed.
      expect(fake.isSessionLiveFor(signedIn.tokens.refreshToken)).toBe(false);
      expect(await endedReason(second.sessions.accessTokenFor(sessionSecret))).toBe('missing');
    },
  );

  it('keeps the session after a rate-limited refresh, which proves the token unused', async () => {
    const instance = await startInstance();
    const { sessionSecret } = await signedInSession(instance);
    makeAccessTokenStale();
    fake.failNextRefresh('rate-limited');

    const error = await instance.sessions
      .accessTokenFor(sessionSecret)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SessionUnavailableError);
    expect(error).toMatchObject({ reason: 'rate-limited', retryAfterSeconds: 30 });
    expect((await rawSessions().findOne())?.refreshClaim).toBeNull();

    await expect(instance.sessions.accessTokenFor(sessionSecret)).resolves.toBeDefined();
    expect(fake.stats.reuseDetected).toBe(0);
  });

  it('ends the session when the API rejects the refresh token', async () => {
    const instance = await startInstance();
    const { sessionSecret, signedIn } = await signedInSession(instance);
    fake.revokeAllSessionsOf(signedIn.user.id);
    makeAccessTokenStale();

    expect(await endedReason(instance.sessions.accessTokenFor(sessionSecret))).toBe(
      'refresh-rejected',
    );
    expect(await rawSessions().countDocuments()).toBe(0);
  });

  it('revokes the new tokens when storing them fails after a successful rotation', async () => {
    const instance = await startInstance((store) => ({
      ...store,
      completeRefresh: async () => {
        throw new Error('simulated write failure');
      },
    }));
    const { sessionSecret, signedIn } = await signedInSession(instance);
    makeAccessTokenStale();

    expect(await endedReason(instance.sessions.accessTokenFor(sessionSecret))).toBe(
      'refresh-uncertain',
    );
    expect(fake.stats.refreshCalls).toBe(1);
    expect(fake.isSessionLiveFor(signedIn.tokens.refreshToken)).toBe(false);
    expect(await rawSessions().countDocuments()).toBe(0);
  });

  it('fails closed when a slow claim holder overruns its lease', async () => {
    const slow = await startInstance((store) => ({
      ...store,
      completeRefresh: async (...args) => {
        await new Promise((resolve) => setTimeout(resolve, TIMING.refreshLeaseMs + 500));
        return store.completeRefresh(...args);
      },
    }));
    const other = await startInstance();
    const { sessionSecret, signedIn } = await signedInSession(slow);
    makeAccessTokenStale();

    const holder = slow.sessions.accessTokenFor(sessionSecret).catch((error: unknown) => error);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const waiter = other.sessions.accessTokenFor(sessionSecret).catch((error: unknown) => error);
    const [holderOutcome, waiterOutcome] = await Promise.all([holder, waiter]);

    expect(holderOutcome).toBeInstanceOf(SessionEndedError);
    expect(waiterOutcome).toBeInstanceOf(SessionEndedError);
    expect(fake.stats.refreshCalls).toBe(1);
    expect(await rawSessions().countDocuments()).toBe(0);
    // Both the rotated tokens and the original session are revoked at the API.
    expect(fake.isSessionLiveFor(signedIn.tokens.refreshToken)).toBe(false);
  });

  it('treats a claim abandoned by a crashed instance as compromised, without refreshing', async () => {
    const [crashed, survivor] = [await startInstance(), await startInstance()];
    const { sessionSecret, signedIn } = await signedInSession(crashed);
    makeAccessTokenStale();
    const record = await rawSessions().findOne();
    // The crashed instance claimed the refresh and never finished.
    await crashed.store.claimRefresh(
      record!._id,
      record!.version,
      { id: 'crashed-claim', expiresAt: new Date(clock.now().getTime() + TIMING.refreshLeaseMs) },
      clock.now(),
    );

    const started = Date.now();
    expect(await endedReason(survivor.sessions.accessTokenFor(sessionSecret))).toBe(
      'refresh-abandoned',
    );
    expect(Date.now() - started).toBeGreaterThanOrEqual(TIMING.refreshLeaseMs - 100);
    expect(fake.stats.refreshCalls).toBe(0);
    expect(fake.isSessionLiveFor(signedIn.tokens.refreshToken)).toBe(false);
  });
});

describe('logout', () => {
  it('removes the session at once and revokes it at the API', async () => {
    const [first, second] = [await startInstance(), await startInstance()];
    const { sessionSecret, signedIn } = await signedInSession(first);

    await expect(first.sessions.endSession(sessionSecret)).resolves.toBe('confirmed');
    expect(await endedReason(second.sessions.accessTokenFor(sessionSecret))).toBe('missing');
    expect(fake.revocationReasonOf(signedIn.tokens.refreshToken)).toBe('logout');
    await expect(first.sessions.endSession(sessionSecret)).resolves.toBe('not-needed');
  });

  it.each(['before-rotation', 'after-rotation'] as const)(
    'cannot be undone by a refresh already in flight (API slow %s)',
    async (phase) => {
      fake.setRefreshDelay(300, phase);
      const [first, second] = [await startInstance(), await startInstance()];
      const { sessionSecret, signedIn } = await signedInSession(first);
      makeAccessTokenStale();

      const refreshing = first.sessions
        .accessTokenFor(sessionSecret)
        .catch((error: unknown) => error);
      await new Promise((resolve) => setTimeout(resolve, 50));
      const signOut = await second.sessions.endSession(sessionSecret);
      const refreshOutcome = await refreshing;

      expect(signOut).toBe('confirmed');
      expect(refreshOutcome).toBeInstanceOf(SessionEndedError);
      expect(await rawSessions().countDocuments()).toBe(0);
      expect(fake.isSessionLiveFor(signedIn.tokens.refreshToken)).toBe(false);
      expect(await endedReason(second.sessions.accessTokenFor(sessionSecret))).toBe('missing');
    },
  );

  it('still ends the local session when the API cannot confirm', async () => {
    const instance = await startInstance();
    const { sessionSecret } = await signedInSession(instance);
    const failingLogout = fake.backend.logout;
    fake.backend.logout = async () => {
      throw new Error('API unreachable');
    };

    await expect(instance.sessions.endSession(sessionSecret)).resolves.toBe('unconfirmed');
    expect(await endedReason(instance.sessions.accessTokenFor(sessionSecret))).toBe('missing');
    fake.backend.logout = failingLogout;
  });
});

describe('backend revocation', () => {
  it('ends the session when the API no longer recognises its access token', async () => {
    const instance = await startInstance();
    const { sessionSecret, signedIn } = await signedInSession(instance);
    fake.revokeAllSessionsOf(signedIn.user.id);

    expect(await endedReason(instance.sessions.currentUser(sessionSecret))).toBe(
      'revoked-by-backend',
    );
    expect(await rawSessions().countDocuments()).toBe(0);
  });
});

describe('the store failing closed', () => {
  it('reports the store as unavailable instead of falling back', async () => {
    const collection = database.client
      .db(database.name)
      .collection<SessionDocument>(SESSION_COLLECTION);
    const sessions = createSessionService({
      store: createMongoSessionStore(collection, async () => {
        throw new Error('indexes not verified');
      }),
      backend: fake.backend,
      vault: createTokenVault(MASTER_KEY),
    });
    const signedIn = await fake.signUp();

    await expect(sessions.startSession(signedIn, new Date())).rejects.toBeInstanceOf(
      SessionUnavailableError,
    );
    // The tokens issued for the failed sign-in are revoked rather than left alive.
    expect(fake.isSessionLiveFor(signedIn.tokens.refreshToken)).toBe(false);
    await expect(
      sessions.accessTokenFor(randomBytes(32).toString('base64url')),
    ).rejects.toBeInstanceOf(SessionUnavailableError);
  });
});

describe('disposable test databases', () => {
  it('refuse non-test database names and non-local servers', () => {
    for (const name of [
      'avuneri-bff',
      'book-tracker',
      'admin',
      'avuneri-bff-test-',
      'avuneri-bff-test-ABCDEFGH',
    ]) {
      expect(() => assertDisposableDatabaseName(name)).toThrow(/disposable/);
    }
    expect(() =>
      testServerUri({ BFF_SESSION_TEST_MONGODB_URI: 'mongodb+srv://cluster0.example.mongodb.net' }),
    ).toThrow();
    expect(() =>
      testServerUri({ BFF_SESSION_TEST_MONGODB_URI: 'mongodb://db.example.com:27017' }),
    ).toThrow();
    expect(() =>
      testServerUri({ BFF_SESSION_TEST_MONGODB_URI: 'mongodb://127.0.0.1:27017/production' }),
    ).toThrow();
  });

  it('leave other collections untouched when creating session indexes', async () => {
    const sentinel = database.db.collection('sentinel');
    await sentinel.insertOne({ keep: true });
    await createMissingSessionIndexes(rawSessions());
    expect(await sentinel.countDocuments({ keep: true })).toBe(1);
    expect((await sentinel.listIndexes().toArray()).map((index) => index.name)).toEqual(['_id_']);
  });
});
