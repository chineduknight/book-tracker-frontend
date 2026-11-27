import 'server-only';
import { MongoClient } from 'mongodb';
import type { SessionStoreLocation } from '../config';

/**
 * Time limits for each use of the store.
 *
 * - `requests` (the app): tight, so a slow or unreachable store fails a page or sign-in fast
 *   instead of holding it; see the refresh budget in docs/auth-session-architecture.md.
 * - `operator` (the index tool, run by hand): generous. It connects from the operator's machine,
 *   often far from the cluster, and an index build can take longer than any page should wait.
 */
const TIMEOUTS = {
  requests: {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 3_000,
    connectTimeoutMS: 3_000,
    waitQueueTimeoutMS: 2_000,
    socketTimeoutMS: 4_000,
  },
  operator: {
    maxPoolSize: 2,
    serverSelectionTimeoutMS: 30_000,
    connectTimeoutMS: 30_000,
    waitQueueTimeoutMS: 30_000,
    socketTimeoutMS: 120_000,
  },
} as const;

export type SessionStoreUse = keyof typeof TIMEOUTS;

/**
 * The one way to connect to the session store. TLS is forced for every remote server in addition
 * to the URI validation in config.ts, so no configuration path can reach a remote store in
 * plaintext. Timeouts bound every stage of an operation.
 */
export function createSessionStoreClient(
  location: SessionStoreLocation,
  appName: string,
  use: SessionStoreUse = 'requests',
): MongoClient {
  return new MongoClient(location.uri, {
    appName,
    ...TIMEOUTS[use],
    ...(location.requiresTls ? { tls: true } : {}),
  });
}
