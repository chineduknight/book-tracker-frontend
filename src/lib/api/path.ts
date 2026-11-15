import { API_PREFIX, API_RESOURCES, type ApiResource } from './contract';
import { ApiConfigError } from './errors';

declare const apiPathBrand: unique symbol;

/** A request path built by {@link apiPath}: allowlisted, relative to the API prefix, encoded. */
export type ApiPath = string & { readonly [apiPathBrand]: true };

const literalPattern = /^[a-z0-9/-]*$/;
const resources: ReadonlySet<string> = new Set<ApiResource>(API_RESOURCES);

/**
 * Builds an API path from a template literal. Literal parts are fixed route segments; every
 * interpolated value is one URI-encoded path segment, so an id can never add segments, a query or a
 * fragment:
 *
 *     apiPath`/books/${bookId}/copies`
 *
 * The first segment must be a known API resource. Query parameters are passed separately to the
 * client and encoded with URLSearchParams.
 */
export function apiPath(strings: TemplateStringsArray, ...values: Array<string | number>): ApiPath {
  for (const literal of strings) {
    if (!literalPattern.test(literal) || literal.includes('//')) {
      throw new ApiConfigError('API path literals may only contain lowercase route segments');
    }
  }

  // Each value must be a whole segment: preceded by "/" and followed by "/" or the end.
  values.forEach((_value, index) => {
    const before = strings[index] ?? '';
    const after = strings[index + 1] ?? '';
    if (!before.endsWith('/') || (after !== '' && !after.startsWith('/'))) {
      throw new ApiConfigError('API path parameters must be complete path segments');
    }
  });

  // The resource must be a literal, never a value.
  const resource = (strings[0] ?? '').split('/')[1] ?? '';
  if (!resources.has(resource)) {
    throw new ApiConfigError('API path does not start with a known API resource');
  }

  let path = strings[0] ?? '';
  values.forEach((value, index) => {
    const segment = String(value);
    if (segment === '' || segment === '.' || segment === '..') {
      throw new ApiConfigError('API path parameters must be non-empty and not "." or ".."');
    }
    path += encodeURIComponent(segment) + (strings[index + 1] ?? '');
  });

  if (!path.startsWith('/') || path.endsWith('/') || path.includes('//')) {
    throw new ApiConfigError('API paths must start with "/" and contain no empty segments');
  }
  return path as ApiPath;
}

const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Validates the configured API base URL and returns it normalised without a trailing slash, e.g.
 * `https://api.example.com/api/v1`. HTTPS is required except for a loopback development API.
 * Error messages never repeat the configured value, which could contain credentials.
 */
export function parseApiBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ApiConfigError('The API base URL must be an absolute URL');
  }

  const isLoopback = loopbackHosts.has(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback)) {
    throw new ApiConfigError(
      'The API base URL must use https (http is allowed only for localhost)',
    );
  }
  if (url.username || url.password) {
    throw new ApiConfigError('The API base URL must not contain credentials');
  }
  if (url.search || url.hash || raw.includes('?') || raw.includes('#')) {
    throw new ApiConfigError('The API base URL must not contain a query string or fragment');
  }

  const pathname = url.pathname.replace(/\/+$/, '');
  if (!pathname.endsWith(API_PREFIX)) {
    throw new ApiConfigError(`The API base URL must end with ${API_PREFIX}`);
  }
  return `${url.origin}${pathname}`;
}
