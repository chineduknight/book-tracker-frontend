import 'server-only';
import { createBackendAuth, type BackendAuth } from '../auth/backend-auth';
import { loadBffConfig, type BffConfig } from '../config';
import { createMongoSessionStore, type SessionDocument } from './mongo-session-store';
import { SESSION_COLLECTION, createIndexReadinessGate } from './session-indexes';
import { createSessionService, type SessionService } from './session-service';
import { createSessionStoreClient } from './session-store-client';
import { createTokenVault } from './token-vault';

export interface BffRuntime {
  config: BffConfig;
  sessions: SessionService;
  backend: BackendAuth;
}

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
  const client = createSessionStoreClient(config.sessionStore, 'avuneri-bff');
  const collection = client
    .db(config.sessionStore.databaseName)
    .collection<SessionDocument>(SESSION_COLLECTION);

  const backend = createBackendAuth({ apiBaseUrl: config.apiBaseUrl });
  const store = createMongoSessionStore(
    collection,
    createIndexReadinessGate(collection, { isDevelopment: process.env.NODE_ENV === 'development' }),
  );
  const sessions = createSessionService({
    store,
    backend,
    vault: createTokenVault(config.sessionMasterKey),
  });
  return { config, sessions, backend };
}
