import { randomBytes } from 'node:crypto';
import { MongoClient, type Db } from 'mongodb';

/**
 * Integration tests may only touch local, disposable databases they created. The server comes from
 * BFF_SESSION_TEST_MONGODB_URI (no database path; loopback hosts only) and defaults to the MongoDB 8
 * the CI workflow and README start on port 27018.
 */
const DEFAULT_TEST_SERVER = 'mongodb://127.0.0.1:27018';
const DISPOSABLE_DATABASE = /^avuneri-bff-test-[a-z0-9]{8}$/;
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

export function testServerUri(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const uri = env.BFF_SESSION_TEST_MONGODB_URI ?? DEFAULT_TEST_SERVER;
  const match = /^mongodb:\/\/([^/@?]+)\/?$/.exec(uri);
  const hosts = match?.[1]?.split(',').map((host) => host.replace(/:\d+$/, '')) ?? [];
  if (hosts.length === 0 || !hosts.every((host) => LOOPBACK.has(host))) {
    throw new Error(
      'BFF_SESSION_TEST_MONGODB_URI must be a mongodb:// URI of loopback hosts without credentials or a database',
    );
  }
  return uri;
}

export function assertDisposableDatabaseName(name: string): void {
  if (!DISPOSABLE_DATABASE.test(name)) {
    throw new Error(
      'Refusing to use a database that is not a disposable avuneri-bff-test-* database',
    );
  }
}

export interface DisposableDatabase {
  client: MongoClient;
  db: Db;
  name: string;
  uri: string;
  /** Drops only this test's own database, re-checking its name first. */
  dispose(): Promise<void>;
}

export async function openDisposableDatabase(): Promise<DisposableDatabase> {
  const serverUri = testServerUri();
  const name = `avuneri-bff-test-${randomBytes(6).toString('hex').slice(0, 8)}`;
  assertDisposableDatabaseName(name);
  const client = new MongoClient(serverUri, { serverSelectionTimeoutMS: 5_000 });
  await client.connect();
  const db = client.db(name);
  return {
    client,
    db,
    name,
    uri: `${serverUri.replace(/\/$/, '')}/${name}`,
    async dispose() {
      assertDisposableDatabaseName(db.databaseName);
      await db.dropDatabase();
      await client.close();
    },
  };
}
