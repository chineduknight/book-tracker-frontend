import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  openDisposableDatabase,
  type DisposableDatabase,
} from '@/test/integration/disposable-database';
import {
  createIndexReadinessGate,
  createMissingSessionIndexes,
  inspectSessionIndexes,
  SESSION_COLLECTION,
  SessionIndexConflictError,
  SessionStoreNotReadyError,
} from './session-indexes';

let database: DisposableDatabase;

beforeEach(async () => {
  database = await openDisposableDatabase();
});

afterEach(async () => {
  await database.dispose();
});

const sessions = () => database.db.collection(SESSION_COLLECTION);

describe('session store indexes', () => {
  it('reports both indexes missing on a new database, without creating anything', async () => {
    await expect(inspectSessionIndexes(sessions())).resolves.toEqual({
      missing: ['verifierDigest_unique', 'sessionExpiresAt_ttl'],
      conflicting: [],
    });
    expect(await database.db.listCollections({ name: SESSION_COLLECTION }).toArray()).toEqual([]);
  });

  it('creates exactly the expected unique and TTL indexes', async () => {
    await expect(createMissingSessionIndexes(sessions())).resolves.toEqual([
      'verifierDigest_unique',
      'sessionExpiresAt_ttl',
    ]);
    const indexes = await sessions().listIndexes().toArray();
    expect(
      indexes.map(({ name, key, unique, expireAfterSeconds }) => ({
        name,
        key,
        unique,
        expireAfterSeconds,
      })),
    ).toEqual([
      { name: '_id_', key: { _id: 1 }, unique: undefined, expireAfterSeconds: undefined },
      {
        name: 'verifierDigest_unique',
        key: { verifierDigest: 1 },
        unique: true,
        expireAfterSeconds: undefined,
      },
      {
        name: 'sessionExpiresAt_ttl',
        key: { sessionExpiresAt: 1 },
        unique: undefined,
        expireAfterSeconds: 0,
      },
    ]);
    await expect(inspectSessionIndexes(sessions())).resolves.toEqual({
      missing: [],
      conflicting: [],
    });
    await expect(createMissingSessionIndexes(sessions())).resolves.toEqual([]);
  });

  it('enforces one session per verifier', async () => {
    await createMissingSessionIndexes(sessions());
    await sessions().insertOne({ _id: 'a' as never, verifierDigest: 'same' });
    await expect(
      sessions().insertOne({ _id: 'b' as never, verifierDigest: 'same' }),
    ).rejects.toThrow(/duplicate key/);
  });

  it('refuses to change a conflicting index and reports it', async () => {
    await sessions().createIndex({ verifierDigest: 1 }, { name: 'verifierDigest_unique' });
    await expect(inspectSessionIndexes(sessions())).resolves.toMatchObject({
      conflicting: ['verifierDigest_unique'],
    });
    await expect(createMissingSessionIndexes(sessions())).rejects.toBeInstanceOf(
      SessionIndexConflictError,
    );
    const names = (await sessions().listIndexes().toArray()).map((index) => index.name);
    expect(names).toEqual(['_id_', 'verifierDigest_unique']);
  });

  it('reports an index with the expected key under another name as a conflict', async () => {
    await sessions().createIndex(
      { sessionExpiresAt: 1 },
      { name: 'legacy_expiry', expireAfterSeconds: 60 },
    );
    await expect(inspectSessionIndexes(sessions())).resolves.toMatchObject({
      conflicting: ['sessionExpiresAt_ttl'],
    });
  });

  it.each([
    ['partial', { partialFilterExpression: { userId: { $exists: true } } }],
    ['sparse', { sparse: true }],
    ['hidden', { hidden: true }],
    ['collated', { collation: { locale: 'en', strength: 2 } }],
  ])(
    'rejects a %s verifier index even with the expected name, key and uniqueness',
    async (_name, options) => {
      await sessions().createIndex(
        { verifierDigest: 1 },
        { name: 'verifierDigest_unique', unique: true, ...options },
      );
      await expect(inspectSessionIndexes(sessions())).resolves.toMatchObject({
        conflicting: ['verifierDigest_unique'],
      });
      await expect(createMissingSessionIndexes(sessions())).rejects.toBeInstanceOf(
        SessionIndexConflictError,
      );
    },
  );

  it('rejects a TTL index that is partial', async () => {
    await sessions().createIndex(
      { sessionExpiresAt: 1 },
      {
        name: 'sessionExpiresAt_ttl',
        expireAfterSeconds: 0,
        partialFilterExpression: { userId: { $exists: true } },
      },
    );
    await expect(inspectSessionIndexes(sessions())).resolves.toMatchObject({
      conflicting: ['sessionExpiresAt_ttl'],
    });
  });
});

describe('index readiness gate', () => {
  function gateWithClock(isDevelopment = false) {
    const clock = { ms: 1_000_000 };
    const gate = createIndexReadinessGate(sessions(), {
      isDevelopment,
      now: () => clock.ms,
      recheckAfterSuccessMs: 60_000,
      recheckAfterFailureMs: 30_000,
    });
    return { gate, clock };
  }

  it('fails closed in production until the indexes exist', async () => {
    const { gate, clock } = gateWithClock();
    await expect(gate()).rejects.toBeInstanceOf(SessionStoreNotReadyError);
    await createMissingSessionIndexes(sessions());
    await expect(gate()).rejects.toBeInstanceOf(SessionStoreNotReadyError);
    clock.ms += 30_001;
    await expect(gate()).resolves.toBeUndefined();
  });

  it('notices an index dropped after a successful check, at the next recheck', async () => {
    await createMissingSessionIndexes(sessions());
    const { gate, clock } = gateWithClock();
    await expect(gate()).resolves.toBeUndefined();

    await sessions().dropIndex('verifierDigest_unique');
    clock.ms += 59_000;
    await expect(gate()).resolves.toBeUndefined();
    clock.ms += 2_000;
    await expect(gate()).rejects.toBeInstanceOf(SessionStoreNotReadyError);
  });

  it('shares one check between concurrent requests', async () => {
    await createMissingSessionIndexes(sessions());
    const { gate } = gateWithClock();
    const listIndexes = vi.spyOn(sessions().constructor.prototype, 'listIndexes');
    await Promise.all(Array.from({ length: 10 }, () => gate()));
    expect(listIndexes).toHaveBeenCalledTimes(1);
  });

  it('creates missing indexes itself in development', async () => {
    const { gate } = gateWithClock(true);
    await expect(gate()).resolves.toBeUndefined();
    await expect(inspectSessionIndexes(sessions())).resolves.toEqual({
      missing: [],
      conflicting: [],
    });
  });
});
