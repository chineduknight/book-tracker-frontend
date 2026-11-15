import type { Collection, Document, IndexDescription } from 'mongodb';

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
        ('expireAfterSeconds' in required ? required.expireAfterSeconds : undefined);
    if (!matches) report.conflicting.push(required.name);
  }
  return report;
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
