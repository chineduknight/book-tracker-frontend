import type { ApiErrorCode, ApiErrorDetail } from './contract';

/*
 * Every failure the API client can produce is one of the classes below. Their messages are fixed,
 * safe strings (or the API's own documented `message`): they never contain response bodies, request
 * URLs, headers or tokens, and the underlying error is deliberately not attached as `cause`, because
 * runtime network errors can include the destination host and port.
 */

/** The API answered with a documented error envelope (4xx/5xx). */
export class ApiError extends Error {
  override readonly name = 'ApiError';
  readonly kind = 'http';
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly requestId: string | undefined;
  readonly details: readonly ApiErrorDetail[];
  /** From `Retry-After` on 429 and 503 responses, in whole seconds. */
  readonly retryAfterSeconds: number | undefined;

  constructor(init: {
    status: number;
    code: ApiErrorCode;
    message: string;
    requestId?: string | undefined;
    details?: readonly ApiErrorDetail[] | undefined;
    retryAfterSeconds?: number | undefined;
  }) {
    super(init.message);
    this.status = init.status;
    this.code = init.code;
    this.requestId = init.requestId;
    this.details = init.details ?? [];
    this.retryAfterSeconds = init.retryAfterSeconds;
  }
}

/** The request never produced an HTTP response (DNS, connection, TLS, refused redirect...). */
export class ApiNetworkError extends Error {
  override readonly name = 'ApiNetworkError';
  readonly kind = 'network';

  constructor() {
    super('The Book Tracker API could not be reached');
  }
}

/** The caller cancelled the request, or the client's timeout elapsed. */
export class ApiAbortError extends Error {
  override readonly name = 'ApiAbortError';
  readonly kind = 'aborted';
  readonly reason: 'cancelled' | 'timeout';

  constructor(reason: 'cancelled' | 'timeout') {
    super(reason === 'timeout' ? 'The request timed out' : 'The request was cancelled');
    this.reason = reason;
  }
}

export type ProtocolErrorReason =
  | 'invalid-json'
  | 'unexpected-content-type'
  | 'invalid-envelope'
  | 'unexpected-status'
  | 'invalid-data';

const protocolMessages: Record<ProtocolErrorReason, string> = {
  'invalid-json': 'The API response was not valid JSON',
  'unexpected-content-type': 'The API response was not JSON',
  'invalid-envelope': 'The API response did not match the expected envelope',
  'unexpected-status': 'The API responded with an unexpected status',
  'invalid-data': 'The API response data did not have the expected shape',
};

/** A response arrived but broke the API contract (e.g. an HTML proxy page, or a malformed body). */
export class ApiProtocolError extends Error {
  override readonly name = 'ApiProtocolError';
  readonly kind = 'protocol';
  readonly status: number;
  readonly reason: ProtocolErrorReason;
  readonly requestId: string | undefined;

  constructor(init: {
    status: number;
    reason: ProtocolErrorReason;
    requestId?: string | undefined;
  }) {
    super(protocolMessages[init.reason]);
    this.status = init.status;
    this.reason = init.reason;
    this.requestId = init.requestId;
  }
}

/** The client was misconfigured or misused (invalid base URL, disallowed path, browser use...). */
export class ApiConfigError extends Error {
  override readonly name = 'ApiConfigError';
  readonly kind = 'config';
}

export type ApiClientError = ApiError | ApiNetworkError | ApiAbortError | ApiProtocolError;

export function isApiClientError(error: unknown): error is ApiClientError {
  return (
    error instanceof ApiError ||
    error instanceof ApiNetworkError ||
    error instanceof ApiAbortError ||
    error instanceof ApiProtocolError
  );
}
