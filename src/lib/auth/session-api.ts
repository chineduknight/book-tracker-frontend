/**
 * The browser-facing session API served by this app under /api/session. It is the only
 * authentication interface the browser sees: it never receives backend tokens.
 */
export const SESSION_API = {
  register: '/api/session/register',
  login: '/api/session/login',
  logout: '/api/session/logout',
  me: '/api/session/me',
} as const;

/** Only what the interface shows: never ids, tokens or timestamps. */
export interface SignedInProfile {
  name: string;
  email: string;
}

export type BackendSignOut = 'confirmed' | 'unconfirmed' | 'not-needed';

export type SessionApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_TAKEN'
  | 'RATE_LIMITED'
  | 'UNAUTHENTICATED'
  | 'SERVICE_UNAVAILABLE'
  | 'FORBIDDEN_ORIGIN'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'PAYLOAD_TOO_LARGE'
  | 'INVALID_JSON';

export interface SessionApiFieldError {
  field: string;
  message: string;
}

export interface SessionApiError {
  code: SessionApiErrorCode;
  message: string;
  fields?: SessionApiFieldError[];
  retryAfterSeconds?: number;
}
