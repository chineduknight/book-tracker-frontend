import 'server-only';

/**
 * `__Host-` makes the browser require `Secure`, `Path=/` and no `Domain`, so no subdomain or
 * plain-HTTP page can set or shadow the session cookie. A loopback `http://` origin (development and
 * local runs of the production build) cannot use `Secure` in every browser, so it gets a distinct name
 * that a deployed site never accepts.
 */
export const SECURE_SESSION_COOKIE = '__Host-avuneri_session';
export const LOCAL_SESSION_COOKIE = 'avuneri_session_local';

export interface SessionCookie {
  name: string;
  value: string;
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
  expires: Date;
  maxAge?: number;
}

export function sessionCookieName(isHttps: boolean): string {
  return isHttps ? SECURE_SESSION_COOKIE : LOCAL_SESSION_COOKIE;
}

export function sessionCookie(isHttps: boolean, value: string, expiresAt: Date): SessionCookie {
  return {
    name: sessionCookieName(isHttps),
    value,
    httpOnly: true,
    secure: isHttps,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  };
}

/** Deletes the cookie with the same name and attributes it was set with. */
export function expiredSessionCookie(isHttps: boolean): SessionCookie {
  return { ...sessionCookie(isHttps, '', new Date(0)), maxAge: 0 };
}
