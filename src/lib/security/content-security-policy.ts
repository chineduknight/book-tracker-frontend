/**
 * The app's Content-Security-Policy. Scripts run only with the per-request nonce ('strict-dynamic'
 * lets those scripts load Next.js's own chunks); nothing may be framed, embedded or posted
 * elsewhere, and the browser may connect only to this origin (the BFF), never to the API.
 * `'unsafe-eval'` is added in development only, where React uses eval for debugging stacks.
 */
export function contentSecurityPolicy(options: {
  nonce: string;
  isDevelopment: boolean;
  isHttps: boolean;
}): string {
  const { nonce, isDevelopment, isHttps } = options;
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'nonce-${nonce}'`,
    // Book covers are shown from the https address the reader saved (never http, never inline
    // script): the reader's browser fetches them directly from that site.
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (isHttps) directives.push('upgrade-insecure-requests');
  return directives.join('; ');
}

/** Set by the proxy from the URL Next.js is serving; any client-supplied value is overwritten. */
export const REQUEST_PATH_HEADER = 'x-avuneri-request-path';
