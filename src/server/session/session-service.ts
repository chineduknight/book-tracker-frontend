import 'server-only';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { ApiError } from '@/lib/api/errors';
import type { AuthenticatedSession, BackendUser, SessionTokens } from '../auth/auth-schemas';
import type { BackendAuth } from '../auth/backend-auth';
import { logEvent } from '../log';
import { SessionEndedError, SessionUnavailableError } from './session-errors';
import type { RefreshClaim, RotatedTokens, SessionRecord, SessionStore } from './session-store';
import { SealedValueError, type TokenVault } from './token-vault';

export interface SessionTiming {
  /** Refresh when the access token has less than this left, absorbing clock skew and latency. */
  accessTokenRefreshMarginMs: number;
  /**
   * How long a refresh claim is held. It must exceed the backend call timeout plus a store write,
   * so a live claim holder always finishes before anyone may treat its claim as abandoned.
   */
  refreshLeaseMs: number;
  refreshPollIntervalMs: number;
}

export const DEFAULT_SESSION_TIMING: SessionTiming = {
  accessTokenRefreshMarginMs: 60_000,
  refreshLeaseMs: 20_000,
  refreshPollIntervalMs: 100,
};

export type BackendSignOut = 'confirmed' | 'unconfirmed' | 'not-needed';

export interface StartedSession {
  sessionSecret: string;
  expiresAt: Date;
}

export interface SessionServiceDependencies {
  store: SessionStore;
  backend: BackendAuth;
  vault: TokenVault;
  now?: () => Date;
  timing?: SessionTiming;
}

/**
 * Browser sessions backed by the API's single-use refresh tokens.
 *
 * Refresh rotation is the critical path: presenting a refresh token twice makes the API revoke the
 * whole session. So exactly one request — on any instance — may exchange a given refresh token:
 *
 * 1. A usable access token is served as is; nothing is refreshed early.
 * 2. Otherwise the request tries to claim the refresh with a compare-and-swap on the session's
 *    version. Only the winner sends the refresh token.
 * 3. Everyone else re-reads until the winner stores the new pair. They never send the old token.
 * 4. The winner stores the new pair only while it still holds its claim. If logout (or an
 *    abandonment) removed the session meanwhile, the new refresh token is revoked instead, so a
 *    session can never be resurrected.
 * 5. Any outcome where the old token may have been consumed without the new pair being stored
 *    (timeout, network or server error, crash, lease expiry) ends the session. The old token is
 *    never retried; logging out with it makes the API revoke the backend session too.
 */
export function createSessionService({
  store,
  backend,
  vault,
  now = () => new Date(),
  timing = DEFAULT_SESSION_TIMING,
}: SessionServiceDependencies) {
  async function startSession(
    signedIn: AuthenticatedSession,
    requestedAt: Date,
  ): Promise<StartedSession> {
    const sessionId = vault.newSessionId();
    const sessionSecret = vault.newSessionSecret();
    const createdAt = now();
    const record: SessionRecord = {
      id: sessionId,
      verifierDigest: vault.verifierDigestOf(sessionSecret),
      userId: signedIn.user.id,
      version: 0,
      ...sealTokens(sessionId, signedIn.tokens, requestedAt),
      refreshClaim: null,
      createdAt,
      updatedAt: createdAt,
    };

    try {
      await store.insert(record);
    } catch {
      logEvent('error', 'session.store_insert_failed');
      await revokeAtBackend(signedIn.tokens.refreshToken);
      throw new SessionUnavailableError('store-unavailable');
    }
    return { sessionSecret, expiresAt: record.sessionExpiresAt };
  }

  async function accessTokenFor(
    sessionSecret: string,
  ): Promise<{ accessToken: string; sessionId: string }> {
    const waitDeadline = now().getTime() + timing.refreshLeaseMs + 2 * timing.refreshPollIntervalMs;
    let session = await findSession(sessionSecret);

    for (;;) {
      if (hasUsableAccessToken(session)) {
        return { accessToken: openAccessToken(session), sessionId: session.id };
      }

      if (session.refreshClaim) {
        if (session.refreshClaim.expiresAt.getTime() <= now().getTime()) {
          await abandonRefresh(session, session.refreshClaim);
        } else if (now().getTime() > waitDeadline) {
          throw new SessionUnavailableError('refresh-wait-timeout');
        } else {
          await sleep(timing.refreshPollIntervalMs);
        }
        session = await findSession(sessionSecret);
        continue;
      }

      const claim: RefreshClaim = {
        id: randomUUID(),
        expiresAt: new Date(now().getTime() + timing.refreshLeaseMs),
      };
      const claimed = await storeOperation(() =>
        store.claimRefresh(session.id, session.version, claim, now()),
      );
      if (!claimed) {
        session = await findSession(sessionSecret);
        continue;
      }
      return { accessToken: await refreshAsClaimHolder(claimed, claim.id), sessionId: claimed.id };
    }
  }

  /**
   * The single way to call the API as the signed-in reader. A 401 from the API means the backend
   * session is gone, so the local session ends too; every other API error is left to the caller.
   */
  async function callAsReader<T>(
    sessionSecret: string,
    call: (accessToken: string) => Promise<T>,
  ): Promise<T> {
    const { accessToken, sessionId } = await accessTokenFor(sessionSecret);
    try {
      return await call(accessToken);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await storeOperation(() => store.deleteById(sessionId));
        logEvent('info', 'session.revoked_by_backend', { requestId: error.requestId });
        throw new SessionEndedError('revoked-by-backend');
      }
      throw error;
    }
  }

  async function currentUser(sessionSecret: string): Promise<BackendUser> {
    try {
      return await callAsReader(sessionSecret, (accessToken) => backend.currentUser(accessToken));
    } catch (error) {
      if (error instanceof SessionEndedError || error instanceof SessionUnavailableError)
        throw error;
      throw backendUnavailable(error);
    }
  }

  async function endSession(sessionSecret: string): Promise<BackendSignOut> {
    if (!vault.isWellFormedSessionSecret(sessionSecret)) return 'not-needed';
    const removed = await storeOperation(() =>
      store.deleteByVerifier(vault.verifierDigestOf(sessionSecret)),
    );
    if (!removed) return 'not-needed';

    let refreshToken: string;
    try {
      refreshToken = vault.open(removed.id, 'refresh-token', removed.sealedRefreshToken);
    } catch {
      return 'unconfirmed';
    }
    return (await revokeAtBackend(refreshToken)) ? 'confirmed' : 'unconfirmed';
  }

  async function findSession(sessionSecret: string): Promise<SessionRecord> {
    if (!vault.isWellFormedSessionSecret(sessionSecret)) throw new SessionEndedError('missing');
    const session = await storeOperation(() =>
      store.findActiveByVerifier(vault.verifierDigestOf(sessionSecret), now()),
    );
    if (!session) throw new SessionEndedError('missing');
    return session;
  }

  function hasUsableAccessToken(session: SessionRecord): boolean {
    return (
      session.refreshClaim === null &&
      session.accessTokenExpiresAt.getTime() - now().getTime() > timing.accessTokenRefreshMarginMs
    );
  }

  async function refreshAsClaimHolder(claimed: SessionRecord, claimId: string): Promise<string> {
    let currentRefreshToken: string;
    try {
      currentRefreshToken = vault.open(claimed.id, 'refresh-token', claimed.sealedRefreshToken);
    } catch {
      await deleteQuietly(() => store.deleteIfClaimedBy(claimed.id, claimId));
      throw new SessionEndedError('corrupted');
    }

    const requestedAt = now();
    let tokens: SessionTokens;
    try {
      tokens = await backend.refresh(currentRefreshToken);
    } catch (error) {
      throw await handleFailedRefresh(error, claimed, claimId, currentRefreshToken);
    }

    const rotated = sealTokens(claimed.id, tokens, requestedAt, claimed.sessionExpiresAt);
    let stored: SessionRecord | null;
    try {
      stored = await store.completeRefresh(claimed.id, claimId, rotated, now());
    } catch {
      logEvent('error', 'session.refresh_not_persisted');
      await revokeAtBackend(tokens.refreshToken);
      await deleteQuietly(() => store.deleteIfClaimedBy(claimed.id, claimId));
      throw new SessionEndedError('refresh-uncertain');
    }
    if (!stored) {
      logEvent('info', 'session.ended_during_refresh');
      await revokeAtBackend(tokens.refreshToken);
      throw new SessionEndedError('ended-during-refresh');
    }
    return tokens.accessToken;
  }

  async function handleFailedRefresh(
    error: unknown,
    claimed: SessionRecord,
    claimId: string,
    presentedRefreshToken: string,
  ): Promise<Error> {
    const requestId = error instanceof ApiError ? error.requestId : undefined;

    // The API rate-limits before reading the token, so a 429 proves the token was not consumed.
    if (error instanceof ApiError && error.status === 429) {
      await deleteQuietly(() => store.releaseRefreshClaim(claimed.id, claimId, now()));
      logEvent('warn', 'session.refresh_rate_limited', { requestId });
      return new SessionUnavailableError('rate-limited', error.retryAfterSeconds);
    }

    await deleteQuietly(() => store.deleteIfClaimedBy(claimed.id, claimId));
    if (error instanceof ApiError && (error.status === 401 || error.status === 400)) {
      logEvent('info', 'session.refresh_rejected', { requestId, status: error.status });
      return new SessionEndedError('refresh-rejected');
    }

    // The token may have been consumed: never retry it. Logging out with it ends the backend
    // session whether or not it was consumed.
    logEvent('warn', 'session.refresh_uncertain', { requestId, reason: errorKind(error) });
    await revokeAtBackend(presentedRefreshToken);
    return new SessionEndedError('refresh-uncertain');
  }

  async function abandonRefresh(session: SessionRecord, claim: RefreshClaim): Promise<void> {
    const removed = await storeOperation(() => store.deleteIfClaimedBy(session.id, claim.id));
    if (!removed) return;
    logEvent('warn', 'session.refresh_abandoned');
    try {
      await revokeAtBackend(vault.open(session.id, 'refresh-token', session.sealedRefreshToken));
    } catch {
      // A corrupted record has nothing left to revoke.
    }
    throw new SessionEndedError('refresh-abandoned');
  }

  async function revokeAtBackend(refreshToken: string): Promise<boolean> {
    try {
      await backend.logout(refreshToken);
      return true;
    } catch (error) {
      // 401: the token was already revoked, expired or rotated (and reuse revokes the session).
      if (error instanceof ApiError && error.status === 401) return true;
      logEvent('warn', 'session.backend_logout_unconfirmed', { reason: errorKind(error) });
      return false;
    }
  }

  function sealTokens(
    sessionId: string,
    tokens: SessionTokens,
    issuedAt: Date,
    currentSessionExpiresAt?: Date,
  ): RotatedTokens {
    // Lifetimes count from when the request was sent, so latency only ever shortens them.
    const issuedAtMs = issuedAt.getTime();
    const reportedSessionEnd = issuedAtMs + tokens.refreshExpiresIn * 1000;
    const sessionExpiresAt = new Date(
      currentSessionExpiresAt
        ? Math.min(currentSessionExpiresAt.getTime(), reportedSessionEnd)
        : reportedSessionEnd,
    );
    return {
      sealedAccessToken: vault.seal(sessionId, 'access-token', tokens.accessToken),
      accessTokenExpiresAt: new Date(issuedAtMs + tokens.expiresIn * 1000),
      sealedRefreshToken: vault.seal(sessionId, 'refresh-token', tokens.refreshToken),
      sessionExpiresAt,
    };
  }

  function openAccessToken(session: SessionRecord): string {
    try {
      return vault.open(session.id, 'access-token', session.sealedAccessToken);
    } catch (error) {
      if (error instanceof SealedValueError) {
        void deleteQuietly(() => store.deleteById(session.id));
        throw new SessionEndedError('corrupted');
      }
      throw error;
    }
  }

  return { startSession, accessTokenFor, callAsReader, currentUser, endSession };
}

export type SessionService = ReturnType<typeof createSessionService>;

async function storeOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof SessionEndedError || error instanceof SessionUnavailableError) throw error;
    logEvent('error', 'session.store_unavailable', { reason: errorKind(error) });
    throw new SessionUnavailableError('store-unavailable');
  }
}

async function deleteQuietly(operation: () => Promise<unknown>): Promise<void> {
  try {
    await operation();
  } catch {
    // Best effort: an orphaned claim expires and is abandoned by the next request.
  }
}

function backendUnavailable(error: unknown): SessionUnavailableError {
  if (error instanceof ApiError && error.status === 429) {
    return new SessionUnavailableError('rate-limited', error.retryAfterSeconds);
  }
  logEvent('warn', 'session.backend_unavailable', { reason: errorKind(error) });
  return new SessionUnavailableError('backend-unavailable');
}

/** A safe, fixed description of an error for logs: its class name only. */
function errorKind(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown';
}
