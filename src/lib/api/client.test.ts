// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  errorResponse,
  fakeFetch,
  hangingFetch,
  jsonResponse,
  REQUEST_ID,
  TEST_BASE_URL,
} from '@/test/fixtures/fetch';
import { createApiClient } from './client';
import {
  ApiAbortError,
  ApiConfigError,
  ApiError,
  ApiNetworkError,
  ApiProtocolError,
  isApiClientError,
} from './errors';
import { apiPath } from './path';

const ACCESS_TOKEN = 'test-access-token.not-a-real-jwt';

function clientWith(fetchImpl: typeof fetch, extra: { getAccessToken?: () => string } = {}) {
  return createApiClient({ baseUrl: TEST_BASE_URL, fetchImpl, ...extra });
}

async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the request to fail');
}

/** No error may carry a token, the base URL or the raw body in its message or serialisation. */
function expectNoLeak(error: unknown, ...secrets: string[]) {
  const rendered = `${String(error)} ${JSON.stringify(error)} ${(error as Error).stack ?? ''}`;
  for (const secret of [ACCESS_TOKEN, 'api.test.invalid', ...secrets]) {
    expect(rendered).not.toContain(secret);
  }
  expect((error as Error).cause).toBeUndefined();
}

describe('successful responses', () => {
  it('decodes { data } from a GET and sends exactly the expected request', async () => {
    const book = { id: '665f1c2ab4e5d1a2b3c4d5e6', title: 'Middlemarch' };
    const { fetchImpl, calls } = fakeFetch(jsonResponse(200, { data: book }));

    await expect(clientWith(fetchImpl).get(apiPath`/books/${book.id}`)).resolves.toEqual(book);

    const [call] = calls();
    expect(call?.url).toBe(`${TEST_BASE_URL}/books/665f1c2ab4e5d1a2b3c4d5e6`);
    expect(call?.init).toMatchObject({
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
    });
    expect(call?.init.body).toBeUndefined();
    expect(call?.headers.get('accept')).toBe('application/json');
    expect(call?.headers.has('content-type')).toBe(false);
    expect(call?.headers.has('authorization')).toBe(false);
  });

  it('decodes a paginated collection and encodes query parameters', async () => {
    const pagination = { page: 2, limit: 20, total: 41, totalPages: 3 };
    const { fetchImpl, calls } = fakeFetch(
      jsonResponse(200, { data: [{ id: 'a' }, { id: 'b' }], meta: { pagination } }),
    );

    const page = await clientWith(fetchImpl).getPage<{ id: string }>(apiPath`/books`, {
      query: { page: 2, limit: 20, q: 'war & peace', format: undefined, archived: null },
    });

    expect(page).toEqual({ items: [{ id: 'a' }, { id: 'b' }], pagination });
    expect(calls()[0]?.url).toBe(`${TEST_BASE_URL}/books?page=2&limit=20&q=war+%26+peace`);
  });

  it('sends JSON bodies for mutations', async () => {
    const { fetchImpl, calls } = fakeFetch(
      jsonResponse(201, { data: { id: 'x', title: 'Emma' } }, { Location: '/api/v1/books/x' }),
      jsonResponse(200, { data: { id: 'x', title: 'Emma (2nd ed.)' } }),
    );
    const client = clientWith(fetchImpl);

    await client.post(apiPath`/books`, { body: { title: 'Emma', format: 'physical' } });
    await client.patch(apiPath`/books/${'x'}`, { body: { title: 'Emma (2nd ed.)' } });

    const [create, update] = calls();
    expect(create?.init.method).toBe('POST');
    expect(create?.init.body).toBe('{"title":"Emma","format":"physical"}');
    expect(create?.headers.get('content-type')).toBe('application/json');
    expect(update?.init.method).toBe('PATCH');
  });

  it('resolves a 204 without parsing a body', async () => {
    const empty = new Response(null, { status: 204, headers: { 'X-Request-Id': REQUEST_ID } });
    const textSpy = vi.spyOn(empty, 'text');
    const { fetchImpl, calls } = fakeFetch(empty);

    await expect(clientWith(fetchImpl).delete(apiPath`/books/${'x'}`)).resolves.toBeUndefined();
    expect(textSpy).not.toHaveBeenCalled();
    expect(calls()[0]?.init.method).toBe('DELETE');
  });

  it('supports a POST that answers 204 through request()', async () => {
    const { fetchImpl } = fakeFetch(new Response(null, { status: 204 }));
    await expect(
      clientWith(fetchImpl).request({
        method: 'POST',
        path: apiPath`/auth/logout`,
        body: { refreshToken: 'opaque' },
        expect: 'empty',
      }),
    ).resolves.toBeUndefined();
  });

  it('runs an injected parser over the payload and each page item', async () => {
    const pagination = { page: 1, limit: 20, total: 1, totalPages: 1 };
    const { fetchImpl } = fakeFetch(
      jsonResponse(200, { data: { status: 'ok' } }),
      jsonResponse(200, { data: [{ n: 1 }], meta: { pagination } }),
    );
    const client = clientWith(fetchImpl);

    const status = await client.get(apiPath`/health`, {
      parse: (data) => (data as { status: string }).status,
    });
    const page = await client.getPage(apiPath`/books`, {
      parse: (item) => (item as { n: number }).n * 10,
    });

    expect(status).toBe('ok');
    expect(page.items).toEqual([10]);
  });
});

describe('bearer token injection', () => {
  it('sends the injected token as an Authorization header', async () => {
    const { fetchImpl, calls } = fakeFetch(jsonResponse(200, { data: { user: {} } }));
    await clientWith(fetchImpl, { getAccessToken: () => ACCESS_TOKEN }).get(apiPath`/auth/me`);
    expect(calls()[0]?.headers.get('authorization')).toBe(`Bearer ${ACCESS_TOKEN}`);
  });

  it('rejects a malformed token without sending it or echoing it', async () => {
    const { fetchImpl } = fakeFetch(jsonResponse(200, { data: {} }));
    const client = clientWith(fetchImpl, { getAccessToken: () => 'bad token\r\nX-Evil: 1' });

    const error = await captureError(client.get(apiPath`/auth/me`));

    expect(error).toBeInstanceOf(ApiConfigError);
    expect(String(error)).not.toContain('bad token');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  describe('in a browser context', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('refuses an access token source', () => {
      vi.stubGlobal('window', {});
      expect(() =>
        createApiClient({ baseUrl: TEST_BASE_URL, getAccessToken: () => ACCESS_TOKEN }),
      ).toThrow(ApiConfigError);
    });
  });
});

describe('API error responses', () => {
  it('preserves a 400 validation error with its details', async () => {
    const details = [{ field: 'title', message: 'Title is required' }];
    const { fetchImpl } = fakeFetch(
      errorResponse(400, 'VALIDATION_ERROR', 'The request contains invalid fields', {
        details: [...details, { field: 1, message: 'dropped: not a documented detail' }],
      }),
    );

    const error = await captureError(clientWith(fetchImpl).post(apiPath`/books`, { body: {} }));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'The request contains invalid fields',
      requestId: REQUEST_ID,
      details,
    });
  });

  it.each([
    [401, 'UNAUTHENTICATED', 'A valid access token is required'],
    [404, 'NOT_FOUND', 'Book not found'],
    [409, 'COPY_ALREADY_ON_LOAN', 'This copy is already on loan'],
    [429, 'RATE_LIMITED', 'Too many requests, try again later'],
    [500, 'INTERNAL_ERROR', 'An unexpected error occurred'],
    [503, 'SERVICE_UNAVAILABLE', 'Service is not ready: database is not connected'],
  ])('preserves status %i and code %s', async (status, code, message) => {
    const { fetchImpl } = fakeFetch(errorResponse(status, code, message));
    const error = await captureError(
      clientWith(fetchImpl, { getAccessToken: () => ACCESS_TOKEN }).get(apiPath`/books`),
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status, code, message, requestId: REQUEST_ID, details: [] });
    expect(isApiClientError(error)).toBe(true);
    expectNoLeak(error);
  });

  it('falls back to the X-Request-Id header when the body has no requestId', async () => {
    const { fetchImpl } = fakeFetch(
      jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'Route not found' } }),
    );
    const error = await captureError(clientWith(fetchImpl).get(apiPath`/books`));
    expect(error).toMatchObject({ status: 404, requestId: REQUEST_ID });
  });
});

describe('abnormal responses', () => {
  it('reports a network failure without the underlying error or destination', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed: connect ECONNREFUSED api.test.invalid:443');
    }) as unknown as typeof fetch;

    const error = await captureError(
      clientWith(fetchImpl, { getAccessToken: () => ACCESS_TOKEN }).get(apiPath`/books`),
    );

    expect(error).toBeInstanceOf(ApiNetworkError);
    expectNoLeak(error, 'ECONNREFUSED');
  });

  it('reports malformed JSON as a protocol error without echoing the body', async () => {
    const { fetchImpl } = fakeFetch(
      new Response('{"data": secret-unparseable', {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'X-Request-Id': REQUEST_ID },
      }),
    );
    const error = await captureError(clientWith(fetchImpl).get(apiPath`/books`));

    expect(error).toBeInstanceOf(ApiProtocolError);
    expect(error).toMatchObject({ reason: 'invalid-json', status: 200, requestId: REQUEST_ID });
    expectNoLeak(error, 'secret-unparseable');
  });

  it('reports a non-JSON error page (e.g. from a proxy) as a protocol error', async () => {
    const { fetchImpl } = fakeFetch(
      new Response('<html>502 Bad Gateway</html>', {
        status: 502,
        headers: { 'Content-Type': 'text/html' },
      }),
    );
    const error = await captureError(clientWith(fetchImpl).get(apiPath`/books`));
    expect(error).toMatchObject({ reason: 'unexpected-content-type', status: 502 });
    expectNoLeak(error, 'Bad Gateway');
  });

  it.each([
    ['a success without data', 200, { items: [] }],
    ['an error without the error envelope', 500, { message: 'boom' }],
    ['an error code that is not a string', 400, { error: { code: 7, message: 'x' } }],
    ['a JSON array', 200, []],
    ['JSON null', 200, null],
  ])('reports %s as an invalid envelope', async (_name, status, body) => {
    const { fetchImpl } = fakeFetch(jsonResponse(status, body));
    const error = await captureError(clientWith(fetchImpl).get(apiPath`/books`));
    expect(error).toBeInstanceOf(ApiProtocolError);
    expect(error).toMatchObject({ reason: 'invalid-envelope', status });
  });

  it('rejects a page whose pagination is missing or malformed', async () => {
    const { fetchImpl } = fakeFetch(
      jsonResponse(200, { data: [] }),
      jsonResponse(200, {
        data: [],
        meta: { pagination: { page: '1', limit: 20, total: 0, totalPages: 0 } },
      }),
    );
    const client = clientWith(fetchImpl);
    await expect(client.getPage(apiPath`/books`)).rejects.toMatchObject({
      reason: 'invalid-envelope',
    });
    await expect(client.getPage(apiPath`/books`)).rejects.toMatchObject({
      reason: 'invalid-envelope',
    });
  });

  it('treats an unexpected 204, or a body where 204 was expected, as a protocol error', async () => {
    const { fetchImpl } = fakeFetch(
      new Response(null, { status: 204 }),
      jsonResponse(200, { data: {} }),
    );
    const client = clientWith(fetchImpl);
    await expect(client.get(apiPath`/books`)).rejects.toMatchObject({
      reason: 'unexpected-status',
    });
    await expect(client.delete(apiPath`/books/${'x'}`)).rejects.toMatchObject({
      reason: 'unexpected-status',
    });
  });

  it('wraps a rejecting parser as invalid data', async () => {
    const { fetchImpl } = fakeFetch(jsonResponse(200, { data: { title: 42 } }));
    const error = await captureError(
      clientWith(fetchImpl).get(apiPath`/books/${'x'}`, {
        parse: () => {
          throw new Error('title must be a string');
        },
      }),
    );
    expect(error).toMatchObject({ kind: 'protocol', reason: 'invalid-data' });
  });
});

describe('cancellation and timeouts', () => {
  it('reports a caller abort as cancelled', async () => {
    const controller = new AbortController();
    const promise = clientWith(hangingFetch()).get(apiPath`/books`, { signal: controller.signal });
    controller.abort();

    const error = await captureError(promise);
    expect(error).toBeInstanceOf(ApiAbortError);
    expect(error).toMatchObject({ reason: 'cancelled' });
  });

  it('reports an elapsed timeout as a timeout', async () => {
    const client = createApiClient({
      baseUrl: TEST_BASE_URL,
      fetchImpl: hangingFetch(),
      timeoutMs: 5,
    });
    await expect(client.get(apiPath`/books`)).rejects.toMatchObject({
      kind: 'aborted',
      reason: 'timeout',
    });
  });

  it('lets a long download opt out of the timeout and still be cancelled', async () => {
    const fetchImpl = hangingFetch();
    const client = createApiClient({ baseUrl: TEST_BASE_URL, fetchImpl, timeoutMs: 5 });
    const controller = new AbortController();

    const promise = client.get(apiPath`/export/archive`, {
      timeoutMs: false,
      signal: controller.signal,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    controller.abort();

    await expect(promise).rejects.toMatchObject({ reason: 'cancelled' });
  });
});
