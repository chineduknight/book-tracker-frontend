import 'server-only';
import type { Route } from 'next';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { loginPathFor } from '@/lib/auth/safe-redirect';
import type { SignedInProfile } from '@/lib/auth/session-api';
import { REQUEST_PATH_HEADER } from '@/lib/security/content-security-policy';
import { sessionCookieName } from './session/session-cookie';
import { SessionEndedError, SessionUnavailableError } from './session/session-errors';
import { getBffRuntime } from './session/session-runtime';

/**
 * The signed-in reader for this request, verified with the API (`/auth/me`) on every render, or
 * null. Cached per request, so the layout and page share one check. Temporary failures throw, so
 * a private page fails closed into the error boundary instead of rendering.
 */
export const getSignedInProfile = cache(async (): Promise<SignedInProfile | null> => {
  const runtime = getBffRuntime();
  const sessionSecret = (await cookies()).get(sessionCookieName(runtime.config.isHttps))?.value;
  if (!sessionSecret) return null;
  try {
    const { name, email } = await runtime.sessions.currentUser(sessionSecret);
    return { name, email };
  } catch (error) {
    if (error instanceof SessionEndedError) return null;
    throw error;
  }
});

/**
 * The authorization boundary for private pages: call it in every private page (and, in later
 * milestones, before every private data fetch), not only in a layout.
 */
export async function requireSignedInProfile(): Promise<SignedInProfile> {
  const profile = await getSignedInProfile();
  if (!profile) redirect(loginPathFor((await headers()).get(REQUEST_PATH_HEADER)) as Route);
  return profile;
}

/**
 * For the sign-in pages only: whether a still-valid session exists, without calling the API. If
 * the session store is unreachable, the visitor simply sees the sign-in form.
 */
export async function hasActiveSession(): Promise<boolean> {
  try {
    const runtime = getBffRuntime();
    const sessionSecret = (await cookies()).get(sessionCookieName(runtime.config.isHttps))?.value;
    if (!sessionSecret) return false;
    await runtime.sessions.accessTokenFor(sessionSecret);
    return true;
  } catch (error) {
    if (error instanceof SessionEndedError || error instanceof SessionUnavailableError)
      return false;
    throw error;
  }
}
