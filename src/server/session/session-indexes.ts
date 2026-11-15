import type { Collection, Document, IndexDescription } from 'mongodb';
import { logEvent } from '../log';

export const SESSION_COLLECTION = 'avuneri_bff_sessions';

/**
 * The only indexes the session collection needs. The unique verifier index makes a cookie map to
 * at most one session; the TTL index lets MongoDB remove sessions after their absolute expiry
 * (lookups still reject expired sessions themselves, because TTL deletion runs only periodically).
 */
export const SESSION_INDEXES = [
  { name: 'verifierDigest_unique', key: { verifierDigest: 1 }, unique: true },
  { name: 'sessionExpiresAt_ttl', key: { sessionExpiresAt: 1 }, expireAfterSeconds: 0 },
] as const satisfies readonly (IndexDescription & { name: string })[];

export interface IndexReport {
  missing: string[];
  conflicting: string[];
}

const NAMESPACE_NOT_FOUND = 26;

/** Read-only comparison of the collection's indexes with {@link SESSION_INDEXES}. */
export async function inspectSessionIndexes<T extends Document>(
  collection: Collection<T>,
): Promise<IndexReport> {
  let existing: Document[];
  try {
    existing = await collection.listIndexes().toArray();
  } catch (error) {
    if ((error as { code?: unknown }).code !== NAMESPACE_NOT_FOUND) throw error;
    existing = [];
  }

  const report: IndexReport = { missing: [], conflicting: [] };
  for (const required of SESSION_INDEXES) {
    const actual = existing.find((index) => index.name === required.name);
    if (!actual) {
      const sameKey = existing.find(
        (index) => JSON.stringify(index.key) === JSON.stringify(required.key),
      );
      report[sameKey ? 'conflicting' : 'missing'].push(required.name);
      continue;
    }
    const matches =
      JSON.stringify(actual.key) === JSON.stringify(required.key) &&
      Boolean(actual.unique) === ('unique' in required && required.unique) &&
      actual.expireAfterSeconds ===
        ('expireAfterSeconds' in required ? required.expireAfterSeconds : undefined) &&
      hasOnlyExpectedOptions(actual);
    if (!matches) report.conflicting.push(required.name);
  }
  return report;
}

/**
 * Fields MongoDB reports for an index like ours. Anything else (a partial filter, `sparse`,
 * `hidden`, a collation...) changes which records the index covers or how it compares them, so
 * a same-named index carrying it does not enforce the guarantee we rely on.
 */
const NEUTRAL_INDEX_FIELDS = new Set([
  'v',
  'key',
  'name',
  'unique',
  'expireAfterSeconds',
  'ns',
  'background',
]);

function hasOnlyExpectedOptions(index: Document): boolean {
  return Object.keys(index).every((field) => NEUTRAL_INDEX_FIELDS.has(field));
}

export class SessionIndexConflictError extends Error {
  override readonly name = 'SessionIndexConflictError';
}

/**
 * Creates missing indexes only. Never drops or changes an index: a conflict stops with an error
 * for an operator to resolve deliberately.
 */
export async function createMissingSessionIndexes<T extends Document>(
  collection: Collection<T>,
): Promise<string[]> {
  const report = await inspectSessionIndexes(collection);
  if (report.conflicting.length > 0) {
    throw new SessionIndexConflictError(
      `Session indexes conflict with the expected definition: ${report.conflicting.join(', ')}`,
    );
  }
  const toCreate = SESSION_INDEXES.filter((index) => report.missing.includes(index.name));
  if (toCreate.length > 0) await collection.createIndexes([...toCreate]);
  return toCreate.map((index) => index.name);
}

export class SessionStoreNotReadyError extends Error {
  override readonly name = 'SessionStoreNotReadyError';
}

export interface IndexReadinessOptions {
  /** Development creates missing indexes itself; elsewhere only the operator tool may. */
  isDevelopment: boolean;
  now?: () => number;
  /** A verified state is trusted only this long, so a later index change is noticed. */
  recheckAfterSuccessMs?: number;
  recheckAfterFailureMs?: number;
}

/**
 * Gates every session-store operation on the indexes matching {@link SESSION_INDEXES}. Serving
 * traffic never changes indexes outside development, and while they do not verify, every
 * operation fails closed. Concurrent requests share one check.
 */
export function createIndexReadinessGate<T extends Document>(
  collection: Collection<T>,
  {
    isDevelopment,
    now = Date.now,
    recheckAfterSuccessMs = 60_000,
    recheckAfterFailureMs = 30_000,
  }: IndexReadinessOptions,
): () => Promise<void> {
  let check: Promise<void> | undefined;
  let isChecking = false;
  let lastSucceeded = false;
  let settledAt = 0;

  async function verify(): Promise<void> {
    if (isDevelopment) {
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

  async function runCheck(): Promise<void> {
    isChecking = true;
    try {
      await verify();
      lastSucceeded = true;
    } catch (error) {
      lastSucceeded = false;
      throw error;
    } finally {
      isChecking = false;
      settledAt = now();
    }
  }

  return async () => {
    const maxAge = lastSucceeded ? recheckAfterSuccessMs : recheckAfterFailureMs;
    if (!check || (!isChecking && now() - settledAt > maxAge)) check = runCheck();
    await check;
  };
}
