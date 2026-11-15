import { librarySections, primaryNavigation } from '@/config/navigation';

/**
 * Where a visitor may be sent after signing in. Only exact, known application paths are accepted,
 * compared as raw strings: absolute URLs, `//host`, backslashes, encoded characters, traversal and
 * query strings can never match, so there is nothing to decode or normalise.
 */
const RETURN_DESTINATIONS: ReadonlySet<string> = new Set([
  ...primaryNavigation.map(({ href }) => href),
  ...librarySections.map(({ href }) => href),
]);

export const DEFAULT_SIGNED_IN_PATH = '/';

export function safeReturnPath(candidate: unknown): string {
  return typeof candidate === 'string' && RETURN_DESTINATIONS.has(candidate)
    ? candidate
    : DEFAULT_SIGNED_IN_PATH;
}

/** `/login`, carrying the page to return to when it is a known destination other than Home. */
export function loginPathFor(returnPath: unknown): string {
  const destination = safeReturnPath(returnPath);
  return destination === DEFAULT_SIGNED_IN_PATH
    ? '/login'
    : `/login?next=${encodeURIComponent(destination)}`;
}

export function withReturnPath(authPage: '/login' | '/register', returnPath: string): string {
  const destination = safeReturnPath(returnPath);
  return destination === DEFAULT_SIGNED_IN_PATH
    ? authPage
    : `${authPage}?next=${encodeURIComponent(destination)}`;
}
