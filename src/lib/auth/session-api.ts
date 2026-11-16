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

export type {
  BffError as SessionApiError,
  BffErrorCode as SessionApiErrorCode,
  BffFieldError as SessionApiFieldError,
} from '@/lib/bff/errors';
