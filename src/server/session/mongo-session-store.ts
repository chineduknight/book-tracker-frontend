import 'server-only';
import type { Collection } from 'mongodb';
import type { RefreshClaim, RotatedTokens, SessionRecord, SessionStore } from './session-store';

export interface SessionDocument {
  _id: string;
  verifierDigest: string;
  userId: string;
  version: number;
  sealedAccessToken: string;
  accessTokenExpiresAt: Date;
  sealedRefreshToken: string;
  sessionExpiresAt: Date;
  refreshClaim: RefreshClaim | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * MongoDB implementation of {@link SessionStore}. Each method is one single-document atomic
 * operation; MongoDB's document-level atomicity is what makes refresh claims safe across
 * processes. `ensureReady` gates every operation (index verification, see session-runtime.ts).
 */
export function createMongoSessionStore(
  collection: Collection<SessionDocument>,
  ensureReady: () => Promise<void> = async () => {},
): SessionStore {
  async function ready<T>(operation: () => Promise<T>): Promise<T> {
    await ensureReady();
    return operation();
  }

  return {
    insert: (record) =>
      ready(async () => {
        await collection.insertOne(toDocument(record));
      }),

    findActiveByVerifier: (verifierDigest, now) =>
      ready(async () =>
        toRecord(await collection.findOne({ verifierDigest, sessionExpiresAt: { $gt: now } })),
      ),

    claimRefresh: (sessionId, expectedVersion, claim, now) =>
      ready(async () =>
        toRecord(
          await collection.findOneAndUpdate(
            {
              _id: sessionId,
              version: expectedVersion,
              refreshClaim: null,
              sessionExpiresAt: { $gt: now },
            },
            { $set: { refreshClaim: claim, updatedAt: now }, $inc: { version: 1 } },
            { returnDocument: 'after' },
          ),
        ),
      ),

    completeRefresh: (sessionId, claimId, tokens: RotatedTokens, now) =>
      ready(async () =>
        toRecord(
          await collection.findOneAndUpdate(
            { _id: sessionId, 'refreshClaim.id': claimId },
            { $set: { ...tokens, refreshClaim: null, updatedAt: now }, $inc: { version: 1 } },
            { returnDocument: 'after' },
          ),
        ),
      ),

    releaseRefreshClaim: (sessionId, claimId, now) =>
      ready(async () => {
        const result = await collection.updateOne(
          { _id: sessionId, 'refreshClaim.id': claimId },
          { $set: { refreshClaim: null, updatedAt: now }, $inc: { version: 1 } },
        );
        return result.modifiedCount === 1;
      }),

    deleteIfClaimedBy: (sessionId, claimId) =>
      ready(async () => {
        const result = await collection.deleteOne({ _id: sessionId, 'refreshClaim.id': claimId });
        return result.deletedCount === 1;
      }),

    deleteById: (sessionId) =>
      ready(async () => (await collection.deleteOne({ _id: sessionId })).deletedCount === 1),

    deleteByVerifier: (verifierDigest) =>
      ready(async () => toRecord(await collection.findOneAndDelete({ verifierDigest }))),
  };
}

function toDocument({ id, ...fields }: SessionRecord): SessionDocument {
  return { _id: id, ...fields };
}

function toRecord(document: SessionDocument | null): SessionRecord | null {
  if (!document) return null;
  const { _id, ...fields } = document;
  return { id: _id, ...fields };
}
