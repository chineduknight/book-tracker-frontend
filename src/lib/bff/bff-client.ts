import type { BffError } from './errors';

export type BffResult<T> =
  | { ok: true; status: number; data: T | undefined }
  | { ok: false; status: number; error: BffError };

export type BffMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const REQUEST_TIMEOUT_MS = 20_000;

const UNREACHABLE: BffError = {
  code: 'SERVICE_UNAVAILABLE',
  message: 'Avuneri could not be reached. Check your connection and try again.',
};

/**
 * Calls this app's own BFF routes (never the API). `status` is 0 when no response arrived; a 204
 * resolves with `data: undefined` and is never parsed.
 */
export async function sendToBff<T>(
  method: BffMethod,
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<BffResult<T>> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers:
        body === undefined
          ? { Accept: 'application/json' }
          : { 'Content-Type': 'application/json', Accept: 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      credentials: 'same-origin',
      cache: 'no-store',
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    return { ok: false, status: 0, error: UNREACHABLE };
  }

  if (response.status === 204) return { ok: true, status: 204, data: undefined };

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
    return { ok: false, status: response.status, error: payload.error as unknown as BffError };
  }
  return { ok: false, status: response.status, error: UNREACHABLE };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
