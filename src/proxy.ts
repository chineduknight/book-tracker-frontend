import { NextResponse, type NextRequest } from 'next/server';
import { contentSecurityPolicy, REQUEST_PATH_HEADER } from '@/lib/security/content-security-policy';

/**
 * Runs before every page and route handler. It does not authenticate: each page and handler checks
 * the session itself. It sets a fresh CSP nonce (which Next.js applies to its scripts) and passes
 * the requested path to server components, which cannot otherwise read it from a layout.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const isHttps = process.env.APP_ORIGIN?.startsWith('https://') ?? false;
  const policy = contentSecurityPolicy({
    nonce,
    isDevelopment: process.env.NODE_ENV === 'development',
    isHttps,
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', policy);
  requestHeaders.set(REQUEST_PATH_HEADER, request.nextUrl.pathname);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', policy);
  if (isHttps) {
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|icon.svg|favicon.ico).*)'],
};
