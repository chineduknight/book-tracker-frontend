import { vi } from 'vitest';

export const TEST_BASE_URL = 'https://api.test.invalid/api/v1';
export const REQUEST_ID = 'c10e79cf-2e60-4a2c-9f35-1ca9cf5bfcb3';

/** A JSON response shaped like the backend's, including `X-Request-Id` and `no-store`. */
export function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Request-Id': REQUEST_ID,
      ...headers,
    },
  });
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
) {
  return jsonResponse(status, { error: { code, message, requestId: REQUEST_ID, ...extra } });
}

/** A fake `fetch` that records each call and answers with the given responses in order. */
export function fakeFetch(...responses: Array<Response | (() => Response | Promise<Response>)>) {
  const queue = [...responses];
  const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
    const next = queue.shift();
    if (!next) throw new Error('fakeFetch: no response queued');
    return typeof next === 'function' ? next() : next;
  });

  return {
    fetchImpl: fetchImpl as unknown as typeof fetch,
    calls: () =>
      fetchImpl.mock.calls.map(([input, init]) => ({
        url: String(input),
        init: init ?? {},
        headers: new Headers(init?.headers),
      })),
  };
}

/** A fake `fetch` that never answers until its signal aborts, like a hung server. */
export function hangingFetch() {
  return vi.fn(
    (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        // Like the real fetch, reject at once if the signal has already aborted.
        if (init?.signal?.aborted) return reject(init.signal.reason);
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      }),
  ) as unknown as typeof fetch;
}
