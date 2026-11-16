import { REAL_API } from './ports';

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Anything that must never reach the browser: the API's address (host and port), its path prefix,
 * a bearer header or a JWT-shaped token.
 */
export const BROWSER_LEAK = new RegExp(
  [escape(new URL(REAL_API).host), '/api/v1/', 'Bearer ', 'eyJ[A-Za-z0-9_-]{10,}\\.eyJ'].join('|'),
);
