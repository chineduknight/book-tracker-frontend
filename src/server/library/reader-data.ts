import 'server-only';
import type { Route } from 'next';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ApiClient } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { loginPathFor } from '@/lib/auth/safe-redirect';
import { REQUEST_PATH_HEADER } from '@/lib/security/content-security-policy';
import { readerApiClient } from '../http/library-route';
import { logEvent } from '../log';
import { sessionCookieName } from '../session/session-cookie';
import { SessionEndedError, SessionUnavailableError } from '../session/session-errors';
import { getBffRuntime } from '../session/session-runtime';

/**
 * What a private page received. "unavailable" is never rendered as an empty list: an outage must
 * not look like a library with no books.
 */
export type ReaderData<T> =
  | { status: 'ok'; value: T }
  | { status: 'not-found' }
  | { status: 'unavailable'; retryAfterSeconds?: number | undefined };

/**
 * Loads private data for a server-rendered page as the signed-in reader: per request, never cached,
 * through the same session layer as the BFF routes. An ended session redirects to sign-in.
 */
export async function loadAsReader<T>(
  load: (api: ApiClient) => Promise<T>,
): Promise<ReaderData<T>> {
  const runtime = getBffRuntime();
  const sessionSecret = (await cookies()).get(sessionCookieName(runtime.config.isHttps))?.value;
  if (!sessionSecret) await redirectToSignIn();

  try {
    const value = await runtime.sessions.callAsReader(sessionSecret ?? '', (accessToken) =>
      load(readerApiClient(runtime, accessToken)),
    );
    return { status: 'ok', value };
  } catch (error) {
    if (error instanceof SessionEndedError) return redirectToSignIn();
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
      return { status: 'not-found' };
    }
    if (error instanceof SessionUnavailableError) {
      return { status: 'unavailable', retryAfterSeconds: error.retryAfterSeconds };
    }
    if (error instanceof ApiError && error.status === 429) {
      return { status: 'unavailable', retryAfterSeconds: error.retryAfterSeconds };
    }
    logEvent('warn', 'library.page_data_unavailable', {
      reason: error instanceof Error ? error.name : 'unknown',
      ...(error instanceof ApiError ? { status: error.status, requestId: error.requestId } : {}),
    });
    return { status: 'unavailable' };
  }
}

async function redirectToSignIn(): Promise<never> {
  redirect(loginPathFor((await headers()).get(REQUEST_PATH_HEADER)) as Route);
}
