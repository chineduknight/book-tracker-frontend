import 'server-only';
import { MongoClient, type Collection } from 'mongodb';
import { createBackendAuth, type BackendAuth } from '../auth/backend-auth';
import { loadBffConfig, type BffConfig } from '../config';
import { logEvent } from '../log';
import { createMongoSessionStore, type SessionDocument } from './mongo-session-store';
import {
  SESSION_COLLECTION,
  createMissingSessionIndexes,
  inspectSessionIndexes,
} from './session-indexes';
import { createSessionService, type SessionService } from './session-service';
import { createTokenVault } from './token-vault';

export interface BffRuntime {
  config: BffConfig;
  sessions: SessionService;
  backend: BackendAuth;
}

export class SessionStoreNotReadyError extends Error {
  override readonly name = 'SessionStoreNotReadyError';
}

const INDEX_RECHECK_AFTER_FAILURE_MS = 30_000;

let runtime: BffRuntime | undefined;

/**
 * The process-wide BFF services, built on first use from validated configuration. The cached
 * MongoClient only pools connections: all session state lives in MongoDB, so any number of
 * instances can serve the same sessions.
 */
export function getBffRuntime(): BffRuntime {
  runtime ??= createBffRuntime(loadBffConfig());
  return runtime;
}

function createBffRuntime(config: BffConfig): BffRuntime {
  const client = new MongoClient(config.sessionStore.uri, {
    appName: 'avuneri-bff',
    maxPoolSize: 10,
    // Bound every stage of a store operation, so a refresh (backend call plus store writes)
    // always ends well inside its claim lease; see DEFAULT_SESSION_TIMING.
    serverSelectionTimeoutMS: 3_000,
    connectTimeoutMS: 3_000,
    waitQueueTimeoutMS: 2_000,
    socketTimeoutMS: 4_000,
  });
  const collection = client
    .db(config.sessionStore.databaseName)
    .collection<SessionDocument>(SESSION_COLLECTION);

  const backend = createBackendAuth({ apiBaseUrl: config.apiBaseUrl });
  const store = createMongoSessionStore(collection, indexReadinessGate(collection));
  const sessions = createSessionService({
    store,
    backend,
    vault: createTokenVault(config.sessionMasterKey),
  });
  return { config, sessions, backend };
}

/**
 * Serving traffic never changes indexes in production: they are created by the operator tool
 * (`npm run session-store:indexes -- --apply`). Until they verify, every session operation fails
 * closed. Development creates missing indexes itself, as the API does.
 */
function indexReadinessGate(collection: Collection<SessionDocument>) {
  let verified: Promise<void> | undefined;
  let failedAt = 0;

  async function verify(): Promise<void> {
    if (process.env.NODE_ENV === 'development') {
      await createMissingSessionIndexes(collection);
      return;
    }
    const report = await inspectSessionIndexes(collection);
    if (report.missing.length > 0 || report.conflicting.length > 0) {
      logEvent('error', 'session.store_indexes_not_ready', {
        reason: [...report.missing, ...report.conflicting].join(','),
      });
      throw new SessionStoreNotReadyError('Session store indexes are not ready');
    }
  }

  return async () => {
    if (!verified || (failedAt && Date.now() - failedAt > INDEX_RECHECK_AFTER_FAILURE_MS)) {
      failedAt = 0;
      verified = verify().catch((error: unknown) => {
        failedAt = Date.now();
        throw error;
      });
    }
    await verified;
  };
}
