import { randomBytes } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { ApiAbortError, ApiError, ApiNetworkError } from '@/lib/api/errors';
import type {
  AuthenticatedSession,
  BackendUser,
  LoginRequest,
  RegistrationRequest,
  SessionTokens,
} from '@/server/auth/auth-schemas';
import type { BackendAuth } from '@/server/auth/backend-auth';

/** How the next refresh call misbehaves, to simulate the failures the BFF must survive. */
export type RefreshFault =
  | 'none'
  | 'rate-limited'
  | 'network-before-send'
  | 'timeout-after-rotation'
  | 'server-error-after-rotation';

interface FakeSession {
  userId: string;
  expiresAt: number;
  revokedReason?: 'logout' | 'refresh_token_reuse' | 'operator';
}

/**
 * An in-memory stand-in for the API's authentication module with the same token semantics:
 * single-use refresh tokens, reuse detection that revokes the whole session (for refresh and
 * logout alike), an absolute session lifetime and access tokens bound to a live session.
 */
export function createFakeBackendAuth(
  options: {
    accessTokenTtlSeconds?: number;
    sessionTtlSeconds?: number;
    refreshDelayMs?: number;
  } = {},
) {
  const { accessTokenTtlSeconds = 900, sessionTtlSeconds = 30 * 24 * 3600 } = options;
  const users = new Map<string, BackendUser & { password: string }>();
  const sessions = new Map<string, FakeSession>();
  const refreshTokens = new Map<string, { sessionId: string; status: 'active' | 'consumed' }>();
  const accessTokens = new Map<string, { sessionId: string; expiresAt: number }>();
  const stats = {
    refreshCalls: 0,
    logoutCalls: 0,
    reuseDetected: 0,
    refreshTokensPresented: [] as string[],
  };
  let refreshFault: RefreshFault = 'none';
  let refreshDelayMs = options.refreshDelayMs ?? 0;
  /** Whether a slow refresh is slow before the API rotates the token, or after (slow response). */
  let refreshDelayPhase: 'before-rotation' | 'after-rotation' = 'before-rotation';

  const token = () => randomBytes(24).toString('base64url');
  const requestId = () => randomBytes(8).toString('hex');

  function isLive(sessionId: string): boolean {
    const session = sessions.get(sessionId);
    return Boolean(session && !session.revokedReason && session.expiresAt > Date.now());
  }

  function issueTokens(sessionId: string): SessionTokens {
    const accessToken = token();
    const refreshToken = token();
    accessTokens.set(accessToken, {
      sessionId,
      expiresAt: Date.now() + accessTokenTtlSeconds * 1000,
    });
    refreshTokens.set(refreshToken, { sessionId, status: 'active' });
    const session = sessions.get(sessionId)!;
    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: accessTokenTtlSeconds,
      refreshExpiresIn: Math.max(1, Math.ceil((session.expiresAt - Date.now()) / 1000)),
    };
  }

  function signIn(user: BackendUser): AuthenticatedSession {
    const sessionId = token();
    sessions.set(sessionId, { userId: user.id, expiresAt: Date.now() + sessionTtlSeconds * 1000 });
    return { user: publicUser(user), tokens: issueTokens(sessionId) };
  }

  function publicUser({ id, name, email, createdAt }: BackendUser): BackendUser {
    return { id, name, email, createdAt };
  }

  /** Mirrors the API: an already-consumed token revokes its session; an unknown one is ignored. */
  function rejectPresented(presented: string): never {
    const record = refreshTokens.get(presented);
    if (record?.status === 'consumed') {
      stats.reuseDetected += 1;
      const session = sessions.get(record.sessionId);
      if (session && !session.revokedReason) session.revokedReason = 'refresh_token_reuse';
    }
    throw new ApiError({
      status: 401,
      code: 'INVALID_REFRESH_TOKEN',
      message: 'Refresh token is invalid, expired or revoked',
      requestId: requestId(),
    });
  }

  const backend: BackendAuth = {
    async register({ name, email, password }: RegistrationRequest) {
      if ([...users.values()].some((user) => user.email === email)) {
        throw new ApiError({
          status: 409,
          code: 'CONFLICT',
          message: 'An account with this email already exists',
        });
      }
      const user = {
        id: randomBytes(12).toString('hex'),
        name,
        email,
        password,
        createdAt: new Date().toISOString(),
      };
      users.set(user.id, user);
      return signIn(user);
    },

    async login({ email, password }: LoginRequest) {
      const user = [...users.values()].find((candidate) => candidate.email === email);
      if (!user || user.password !== password) {
        throw new ApiError({
          status: 401,
          code: 'INVALID_CREDENTIALS',
          message: 'Email or password is incorrect',
        });
      }
      return signIn(user);
    },

    async refresh(presented: string) {
      stats.refreshCalls += 1;
      stats.refreshTokensPresented.push(presented);
      const fault = refreshFault;
      refreshFault = 'none';
      if (fault === 'rate-limited') {
        throw new ApiError({
          status: 429,
          code: 'RATE_LIMITED',
          message: 'Too many requests, try again later',
          retryAfterSeconds: 30,
        });
      }
      if (fault === 'network-before-send') throw new ApiNetworkError();
      if (refreshDelayMs > 0 && refreshDelayPhase === 'before-rotation')
        await sleep(refreshDelayMs);

      const record = refreshTokens.get(presented);
      if (!record || record.status !== 'active' || !isLive(record.sessionId))
        rejectPresented(presented);
      record.status = 'consumed';
      const tokens = issueTokens(record.sessionId);
      if (refreshDelayMs > 0 && refreshDelayPhase === 'after-rotation') await sleep(refreshDelayMs);

      if (fault === 'timeout-after-rotation') throw new ApiAbortError('timeout');
      if (fault === 'server-error-after-rotation') {
        throw new ApiError({
          status: 500,
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
        });
      }
      return tokens;
    },

    async logout(presented: string) {
      stats.logoutCalls += 1;
      const record = refreshTokens.get(presented);
      if (!record || record.status !== 'active' || !isLive(record.sessionId))
        rejectPresented(presented);
      sessions.get(record.sessionId)!.revokedReason = 'logout';
    },

    async currentUser(accessToken: string) {
      const record = accessTokens.get(accessToken);
      if (!record || record.expiresAt <= Date.now() || !isLive(record.sessionId)) {
        throw new ApiError({
          status: 401,
          code: 'UNAUTHENTICATED',
          message: 'A valid access token is required',
        });
      }
      return publicUser(users.get(sessions.get(record.sessionId)!.userId)!);
    },
  };

  return {
    backend,
    stats,
    failNextRefresh(fault: RefreshFault) {
      refreshFault = fault;
    },
    setRefreshDelay(
      milliseconds: number,
      phase: 'before-rotation' | 'after-rotation' = 'before-rotation',
    ) {
      refreshDelayMs = milliseconds;
      refreshDelayPhase = phase;
    },
    /** Signs up a reader directly, as if through the API. */
    async signUp(email = `reader-${token().slice(0, 8)}@example.test`, name = 'Test Reader') {
      return backend.register({ name, email, password: 'a long enough passphrase' });
    },
    revokeAllSessionsOf(userId: string) {
      for (const session of sessions.values()) {
        if (session.userId === userId) session.revokedReason = 'operator';
      }
    },
    isSessionLiveFor(refreshOrAccessToken: string): boolean {
      const sessionId =
        refreshTokens.get(refreshOrAccessToken)?.sessionId ??
        accessTokens.get(refreshOrAccessToken)?.sessionId;
      return sessionId ? isLive(sessionId) : false;
    },
    revocationReasonOf(refreshToken: string) {
      const sessionId = refreshTokens.get(refreshToken)?.sessionId;
      return sessionId ? sessions.get(sessionId)?.revokedReason : undefined;
    },
  };
}

export type FakeBackendAuth = ReturnType<typeof createFakeBackendAuth>;
