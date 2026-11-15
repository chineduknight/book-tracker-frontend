import { createApiClient, type AccessTokenSource, type ApiClient } from './client';
import { ApiConfigError } from './errors';

/**
 * Server-side wiring for the API client. Nothing imports this in FE #15: the placeholder pages
 * render without any backend call and without API_BASE_URL. It exists so later milestones have a
 * single, tested place that reads the server-only configuration.
 *
 * API_BASE_URL must never be given a NEXT_PUBLIC_ prefix: it is read at request time on the server
 * and is not inlined into browser bundles (scripts/check-bundle.mjs verifies that).
 */
export function readApiBaseUrl(env: Readonly<Record<string, string | undefined>> = process.env) {
  const value = env.API_BASE_URL?.trim();
  if (!value) throw new ApiConfigError('API_BASE_URL is not configured');
  return value;
}

export function createServerApiClient(
  options: {
    getAccessToken?: AccessTokenSource;
    fetchImpl?: typeof fetch;
    env?: Readonly<Record<string, string | undefined>>;
  } = {},
): ApiClient {
  if (typeof window !== 'undefined') {
    throw new ApiConfigError('The server API client cannot be used in the browser');
  }
  const { env, ...clientOptions } = options;
  return createApiClient({ baseUrl: readApiBaseUrl(env), ...clientOptions });
}
