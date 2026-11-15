import { readDataEnvelope, readErrorEnvelope, readPageEnvelope, type Page } from './contract';
import {
  ApiAbortError,
  ApiConfigError,
  ApiError,
  ApiNetworkError,
  ApiProtocolError,
  type ProtocolErrorReason,
} from './errors';
import { parseApiBaseUrl, type ApiPath } from './path';

/**
 * A small typed transport for the Book Tracker API.
 *
 * - Requests go only to the validated base URL plus an allowlisted {@link ApiPath}.
 * - `fetch` is injected, so tests (and, later, a server-side session layer) control it fully.
 * - Every request is `cache: 'no-store'`, sends no cookies and refuses redirects, so a bearer token
 *   can never follow a redirect to another host.
 * - Failures are always one of the typed errors in `./errors`, with safe messages.
 *
 * It does not store, refresh or retry tokens. Where the access token comes from — and whether the
 * browser ever talks to the API directly — is the browser-session decision for FE #16.
 */

export type QueryValue = string | number | boolean | null | undefined;
export type QueryParams = Readonly<Record<string, QueryValue>>;

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** What a successful response must contain. */
export type Expectation = 'data' | 'page' | 'empty';

export type AccessTokenSource = () => string | undefined | Promise<string | undefined>;

export interface ApiClientOptions {
  /** Absolute base URL ending in `/api/v1`, validated by `parseApiBaseUrl`. */
  baseUrl: string;
  /** Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Supplies the bearer token per request. Server-side only; see {@link createApiClient}. */
  getAccessToken?: AccessTokenSource;
  /** Default per-request timeout. Defaults to {@link DEFAULT_TIMEOUT_MS}. */
  timeoutMs?: number;
}

export interface RequestOptions<T> {
  query?: QueryParams;
  /** Serialised as JSON. Omit for requests without a body. */
  body?: unknown;
  /** Lets the caller cancel the request (e.g. a navigation away). */
  signal?: AbortSignal;
  /**
   * Overrides the client's timeout for this request. Pass `false` for downloads such as exports,
   * which may legitimately take longer; the caller's `signal` still applies.
   */
  timeoutMs?: number | false;
  /** Validates and narrows the `data` payload (or each page item). Throw to reject it. */
  parse?: (data: unknown) => T;
}

export interface ApiRequest<T> extends RequestOptions<T> {
  method: HttpMethod;
  path: ApiPath;
  expect: Expectation;
}

/**
 * Covers the time to receive and read the whole response. Short enough to fail a hung request,
 * long enough for normal API calls; exports opt out per request.
 */
export const DEFAULT_TIMEOUT_MS = 15_000;

// RFC 6750 b64token.
const bearerTokenPattern = /^[A-Za-z0-9\-._~+/]+=*$/;

export function createApiClient(options: ApiClientOptions) {
  const baseUrl = parseApiBaseUrl(options.baseUrl);
  const base = new URL(baseUrl);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const { getAccessToken } = options;
  const defaultTimeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (getAccessToken && typeof window !== 'undefined') {
    // Bearer tokens stay on the server until FE #16 decides the browser session design.
    throw new ApiConfigError('An access token source may only be used in server-side code');
  }

  function buildUrl(path: ApiPath, query: QueryParams | undefined): URL {
    const url = new URL(`${baseUrl}${path}`);
    // Defence in depth: whatever the path, the request must stay under the configured API prefix.
    if (url.origin !== base.origin || !url.pathname.startsWith(`${base.pathname}/`)) {
      throw new ApiConfigError('The request path resolves outside the configured API');
    }
    if (query) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) params.append(key, String(value));
      }
      const search = params.toString();
      if (search) url.search = search;
    }
    return url;
  }

  async function buildHeaders(hasBody: boolean): Promise<Headers> {
    const headers = new Headers({ Accept: 'application/json' });
    if (hasBody) headers.set('Content-Type', 'application/json');
    const token = getAccessToken ? await getAccessToken() : undefined;
    if (token !== undefined) {
      if (!bearerTokenPattern.test(token)) {
        throw new ApiConfigError('The access token is not a valid bearer token');
      }
      headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  }

  async function request<T>(req: ApiRequest<T>): Promise<T | Page<T> | undefined> {
    const url = buildUrl(req.path, req.query);
    const hasBody = req.body !== undefined;
    const headers = await buildHeaders(hasBody);

    const timeout = req.timeoutMs ?? defaultTimeout;
    const timeoutSignal = timeout === false ? undefined : AbortSignal.timeout(timeout);
    const signals = [timeoutSignal, req.signal].filter((s): s is AbortSignal => s !== undefined);
    const signal = signals.length > 0 ? AbortSignal.any(signals) : undefined;

    const failure = (): ApiAbortError | ApiNetworkError => {
      if (req.signal?.aborted) return new ApiAbortError('cancelled');
      if (timeoutSignal?.aborted) return new ApiAbortError('timeout');
      return new ApiNetworkError();
    };

    const init: RequestInit = {
      method: req.method,
      headers,
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
    };
    if (hasBody) init.body = JSON.stringify(req.body);
    if (signal) init.signal = signal;

    let response: Response;
    try {
      response = await fetchImpl(url, init);
    } catch {
      throw failure();
    }

    const status = response.status;
    const requestId = response.headers.get('x-request-id') ?? undefined;
    const protocolError = (reason: ProtocolErrorReason) =>
      new ApiProtocolError({ status, reason, requestId });

    // A 204 has no body by definition: never try to parse it.
    if (status === 204) {
      if (req.expect === 'empty') return undefined;
      throw protocolError('unexpected-status');
    }

    if (!isJsonContentType(response.headers.get('content-type'))) {
      throw protocolError('unexpected-content-type');
    }

    let text: string;
    try {
      text = await response.text();
    } catch {
      throw failure();
    }

    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw protocolError('invalid-json');
    }

    if (!response.ok) {
      const envelope = readErrorEnvelope(body);
      if (!envelope) throw protocolError('invalid-envelope');
      const { code, message, details } = envelope.error;
      throw new ApiError({
        status,
        code,
        message,
        requestId: envelope.error.requestId ?? requestId,
        details,
      });
    }

    if (req.expect === 'empty') throw protocolError('unexpected-status');

    const parse = (data: unknown): T => {
      if (!req.parse) return data as T;
      try {
        return req.parse(data);
      } catch {
        throw protocolError('invalid-data');
      }
    };

    if (req.expect === 'page') {
      const envelope = readPageEnvelope(body);
      if (!envelope) throw protocolError('invalid-envelope');
      return { items: envelope.data.map(parse), pagination: envelope.meta.pagination };
    }

    const envelope = readDataEnvelope(body);
    if (!envelope) throw protocolError('invalid-envelope');
    return parse(envelope.data);
  }

  return {
    /** The normalised base URL, for diagnostics in server code. */
    baseUrl,

    get<T>(path: ApiPath, options: RequestOptions<T> = {}): Promise<T> {
      return request({ ...options, method: 'GET', path, expect: 'data' }) as Promise<T>;
    },

    getPage<T>(path: ApiPath, options: RequestOptions<T> = {}): Promise<Page<T>> {
      return request({ ...options, method: 'GET', path, expect: 'page' }) as Promise<Page<T>>;
    },

    post<T>(path: ApiPath, options: RequestOptions<T> = {}): Promise<T> {
      return request({ ...options, method: 'POST', path, expect: 'data' }) as Promise<T>;
    },

    put<T>(path: ApiPath, options: RequestOptions<T> = {}): Promise<T> {
      return request({ ...options, method: 'PUT', path, expect: 'data' }) as Promise<T>;
    },

    patch<T>(path: ApiPath, options: RequestOptions<T> = {}): Promise<T> {
      return request({ ...options, method: 'PATCH', path, expect: 'data' }) as Promise<T>;
    },

    /** Expects `204 No Content`. */
    delete(path: ApiPath, options: Omit<RequestOptions<never>, 'parse'> = {}): Promise<void> {
      return request({ ...options, method: 'DELETE', path, expect: 'empty' }) as Promise<void>;
    },

    /** The general form, e.g. a `POST` that answers `204` (`expect: 'empty'`). */
    request,
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

function isJsonContentType(header: string | null): boolean {
  if (!header) return false;
  const mediaType = header.split(';')[0]?.trim().toLowerCase() ?? '';
  return mediaType === 'application/json' || /^application\/[a-z0-9.+-]+\+json$/.test(mediaType);
}
