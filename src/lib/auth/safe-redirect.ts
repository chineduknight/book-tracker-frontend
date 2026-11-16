import { librarySections, primaryNavigation } from '@/config/navigation';

/**
 * Where a visitor may be sent after signing in. Only exact, known application paths (and anchored
 * patterns for library records) are accepted, compared as raw strings: absolute URLs, `//host`,
 * backslashes, encoded characters, traversal and query strings can never match, so there is
 * nothing to decode or normalise.
 */
const RETURN_DESTINATIONS: ReadonlySet<string> = new Set([
  ...primaryNavigation.map(({ href }) => href),
  ...librarySections.map(({ href }) => href),
  '/library/new',
  '/library/locations',
  '/library/wishlist/new',
  '/reading/new',
  '/notes/new',
]);

/** Deep library pages, anchored and limited to lowercase API ids. */
const RETURN_PATTERNS: readonly RegExp[] = [
  /^\/library\/books\/[0-9a-f]{24}(\/edit)?$/,
  /^\/library\/(categories|collections|wishlist)\/[0-9a-f]{24}$/,
  /^\/reading\/[0-9a-f]{24}$/,
  /^\/notes\/[0-9a-f]{24}(\/edit)?$/,
];

export const DEFAULT_SIGNED_IN_PATH = '/';

export function safeReturnPath(candidate: unknown): string {
  if (typeof candidate !== 'string') return DEFAULT_SIGNED_IN_PATH;
  const isKnown =
    RETURN_DESTINATIONS.has(candidate) ||
    RETURN_PATTERNS.some((pattern) => pattern.test(candidate));
  return isKnown ? candidate : DEFAULT_SIGNED_IN_PATH;
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
