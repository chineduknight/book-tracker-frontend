import type { SessionRecord, SessionStore } from '@/server/session/session-store';

/** A single-process SessionStore with the same conditional-write semantics, for fast unit tests. */
export function createMemorySessionStore(): SessionStore & { records: Map<string, SessionRecord> } {
  const records = new Map<string, SessionRecord>();
  const copy = (record: SessionRecord | undefined) => (record ? structuredClone(record) : null);

  return {
    records,
    async insert(record) {
      if (
        [...records.values()].some((existing) => existing.verifierDigest === record.verifierDigest)
      ) {
        throw new Error('duplicate verifier');
      }
      records.set(record.id, structuredClone(record));
    },
    async findActiveByVerifier(verifierDigest, now) {
      const record = [...records.values()].find((r) => r.verifierDigest === verifierDigest);
      return record && record.sessionExpiresAt > now ? copy(record) : null;
    },
    async claimRefresh(sessionId, expectedVersion, claim, now) {
      const record = records.get(sessionId);
      if (
        !record ||
        record.version !== expectedVersion ||
        record.refreshClaim ||
        record.sessionExpiresAt <= now
      ) {
        return null;
      }
      Object.assign(record, { refreshClaim: claim, updatedAt: now, version: record.version + 1 });
      return copy(record);
    },
    async completeRefresh(sessionId, claimId, tokens, now) {
      const record = records.get(sessionId);
      if (record?.refreshClaim?.id !== claimId) return null;
      Object.assign(record, tokens, {
        refreshClaim: null,
        updatedAt: now,
        version: record.version + 1,
      });
      return copy(record);
    },
    async releaseRefreshClaim(sessionId, claimId, now) {
      const record = records.get(sessionId);
      if (record?.refreshClaim?.id !== claimId) return false;
      Object.assign(record, { refreshClaim: null, updatedAt: now, version: record.version + 1 });
      return true;
    },
    async deleteIfClaimedBy(sessionId, claimId) {
      if (records.get(sessionId)?.refreshClaim?.id !== claimId) return false;
      return records.delete(sessionId);
    },
    async deleteById(sessionId) {
      return records.delete(sessionId);
    },
    async deleteByVerifier(verifierDigest) {
      const record = [...records.values()].find((r) => r.verifierDigest === verifierDigest);
      if (!record) return null;
      records.delete(record.id);
      return record;
    },
  };
}
