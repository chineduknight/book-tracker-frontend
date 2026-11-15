import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  openDisposableDatabase,
  type DisposableDatabase,
} from '@/test/integration/disposable-database';
import {
  createMissingSessionIndexes,
  inspectSessionIndexes,
  SESSION_COLLECTION,
  SessionIndexConflictError,
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
});
