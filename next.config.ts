import type { NextConfig } from 'next';

/**
 * Baseline response headers for every route. The Content-Security-Policy (with a per-request nonce)
 * and, over HTTPS, Strict-Transport-Security are set in src/proxy.ts.
 *
 * Avuneri is a private app with nothing to publish, so no page or response may be indexed. There is
 * deliberately no robots.txt blocking crawlers: a blocked crawler never sees this header.
 */
const securityHeaders = [
  { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  typedRoutes: true,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
