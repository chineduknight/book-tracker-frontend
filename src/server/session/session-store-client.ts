import 'server-only';
import { MongoClient } from 'mongodb';
import type { SessionStoreLocation } from '../config';

/**
 * The one way to connect to the session store. TLS is forced for every remote server in addition
 * to the URI validation in config.ts, so no configuration path can reach a remote store in
 * plaintext. Timeouts bound every stage of an operation; see the refresh budget in
 * docs/auth-session-architecture.md.
 */
export function createSessionStoreClient(
  location: SessionStoreLocation,
  appName: string,
): MongoClient {
  return new MongoClient(location.uri, {
    appName,
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 3_000,
    connectTimeoutMS: 3_000,
    waitQueueTimeoutMS: 2_000,
    socketTimeoutMS: 4_000,
    ...(location.requiresTls ? { tls: true } : {}),
  });
}
