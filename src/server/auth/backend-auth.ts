import 'server-only';
import type { z } from 'zod';
import { createApiClient } from '@/lib/api/client';
import { apiPath } from '@/lib/api/path';
import {
  authenticatedSessionSchema,
  currentUserSchema,
  refreshedSessionSchema,
  type AuthenticatedSession,
  type BackendUser,
  type LoginRequest,
  type RegistrationRequest,
  type SessionTokens,
} from './auth-schemas';

/** The five backend authentication endpoints, as the BFF uses them. */
export interface BackendAuth {
  register(registration: RegistrationRequest): Promise<AuthenticatedSession>;
  login(credentials: LoginRequest): Promise<AuthenticatedSession>;
  refresh(refreshToken: string): Promise<SessionTokens>;
  logout(refreshToken: string): Promise<void>;
  currentUser(accessToken: string): Promise<BackendUser>;
}

/**
 * Bounded so a refresh always finishes (or fails) well inside the refresh claim's lease; see
 * DEFAULT_SESSION_TIMING in session-service.ts.
 */
export const BACKEND_AUTH_TIMEOUT_MS = 8_000;

export function createBackendAuth(options: {
  apiBaseUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): BackendAuth {
  const { apiBaseUrl, fetchImpl, timeoutMs = BACKEND_AUTH_TIMEOUT_MS } = options;
  const anonymous = createApiClient({
    baseUrl: apiBaseUrl,
    timeoutMs,
    ...(fetchImpl ? { fetchImpl } : {}),
  });
  const parseWith =
    <Schema extends z.ZodType>(schema: Schema) =>
    (data: unknown): z.output<Schema> =>
      schema.parse(data);

  return {
    register: (registration) =>
      anonymous.post(apiPath`/auth/register`, {
        body: registration,
        parse: parseWith(authenticatedSessionSchema),
      }),

    login: (credentials) =>
      anonymous.post(apiPath`/auth/login`, {
        body: credentials,
        parse: parseWith(authenticatedSessionSchema),
      }),

    refresh: async (refreshToken) => {
      const { tokens } = await anonymous.post(apiPath`/auth/refresh`, {
        body: { refreshToken },
        parse: parseWith(refreshedSessionSchema),
      });
      return tokens;
    },

    logout: async (refreshToken) => {
      await anonymous.request({
        method: 'POST',
        path: apiPath`/auth/logout`,
        body: { refreshToken },
        expect: 'empty',
      });
    },

    currentUser: async (accessToken) => {
      const authenticated = createApiClient({
        baseUrl: apiBaseUrl,
        timeoutMs,
        getAccessToken: () => accessToken,
        ...(fetchImpl ? { fetchImpl } : {}),
      });
      const { user } = await authenticated.get(apiPath`/auth/me`, {
        parse: parseWith(currentUserSchema),
      });
      return user;
    },
  };
}
