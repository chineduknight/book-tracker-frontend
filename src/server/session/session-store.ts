/**
 * Durable state of one browser session. Backend tokens are stored sealed (see token-vault.ts),
 * and the browser's cookie value is represented only by its keyed verifier digest.
 */
export interface SessionRecord {
  id: string;
  verifierDigest: string;
  userId: string;
  /** Incremented by every change; refresh claims compare-and-swap on it. */
  version: number;
  sealedAccessToken: string;
  accessTokenExpiresAt: Date;
  sealedRefreshToken: string;
  /** The backend session's absolute end. Refreshing never extends it. */
  sessionExpiresAt: Date;
  /** Present while one request, on any instance, is exchanging the refresh token. */
  refreshClaim: RefreshClaim | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RefreshClaim {
  id: string;
  expiresAt: Date;
}

export interface RotatedTokens {
  sealedAccessToken: string;
  accessTokenExpiresAt: Date;
  sealedRefreshToken: string;
  sessionExpiresAt: Date;
}

/**
 * Every mutation is a single atomic conditional write, so concurrent requests on separate
 * instances coordinate through the store alone, never through process memory.
 */
export interface SessionStore {
  insert(record: SessionRecord): Promise<void>;
  /** Rejects expired sessions itself: TTL deletion is eventually consistent. */
  findActiveByVerifier(verifierDigest: string, now: Date): Promise<SessionRecord | null>;
  /** Succeeds only if the session is still at `expectedVersion` with no claim. */
  claimRefresh(
    sessionId: string,
    expectedVersion: number,
    claim: RefreshClaim,
    now: Date,
  ): Promise<SessionRecord | null>;
  /** Succeeds only while `claimId` still holds the claim. */
  completeRefresh(
    sessionId: string,
    claimId: string,
    tokens: RotatedTokens,
    now: Date,
  ): Promise<SessionRecord | null>;
  releaseRefreshClaim(sessionId: string, claimId: string, now: Date): Promise<boolean>;
  deleteIfClaimedBy(sessionId: string, claimId: string): Promise<boolean>;
  deleteById(sessionId: string): Promise<boolean>;
  deleteByVerifier(verifierDigest: string): Promise<SessionRecord | null>;
}
