import type { SessionApiError } from './session-api';

export type SessionApiResult<T> =
  { ok: true; status: number; data: T } | { ok: false; status: number; error: SessionApiError };

const REQUEST_TIMEOUT_MS = 20_000;

const UNREACHABLE: SessionApiError = {
  code: 'SERVICE_UNAVAILABLE',
  message: 'Avuneri could not be reached. Check your connection and try again.',
};

/** POSTs JSON to this app's own session API. `status` is 0 when no response arrived. */
export async function postToSessionApi<T>(
  path: string,
  body: unknown,
): Promise<SessionApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      credentials: 'same-origin',
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, status: 0, error: UNREACHABLE };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }
  if (response.ok && isObject(payload) && 'data' in payload) {
    return { ok: true, status: response.status, data: payload.data as T };
  }
  if (isObject(payload) && isObject(payload.error) && typeof payload.error.code === 'string') {
    return {
      ok: false,
      status: response.status,
      error: payload.error as unknown as SessionApiError,
    };
  }
  return { ok: false, status: response.status, error: UNREACHABLE };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
