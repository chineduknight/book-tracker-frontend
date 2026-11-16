import 'server-only';
import type { NextRequest, NextResponse } from 'next/server';
import type { z } from 'zod';
import { createApiClient, type ApiClient } from '@/lib/api/client';
import { ApiError, isApiClientError } from '@/lib/api/errors';
import type { BffError, BffErrorCode, BffFieldError } from '@/lib/bff/errors';
import { isObjectId } from '@/lib/library/rules';
import { BffConfigError } from '../config';
import { logEvent } from '../log';
import { expiredSessionCookie, sessionCookieName } from '../session/session-cookie';
import { SessionEndedError, SessionUnavailableError } from '../session/session-errors';
import { getBffRuntime, type BffRuntime } from '../session/session-runtime';
import {
  dataResponse,
  errorResponse,
  noContentResponse,
  serviceUnavailableResponse,
} from './bff-response';
import {
  isErrorResponse,
  MAX_LIBRARY_REQUEST_BYTES,
  readBodyText,
  readJsonBody,
  rejectUnsafeMutation,
} from './mutation-guard';

export type LibraryMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type QueryResult<T> = { ok: true; value: T } | { ok: false; error: BffError };

/**
 * One browser-facing library operation. Each route file declares exactly one backend call: this
 * is never a generic proxy, and the browser can neither choose the API path nor see the API.
 */
export interface LibraryOperation<Input, Result, IdName extends string = never> {
  /** Route parameters, each of which must be an API id. */
  ids?: readonly IdName[];
  /** For writes with a JSON body: the strict schema mirroring the API's. */
  body?: z.ZodType<Input>;
  /** For reads: an allowlisted query parser. */
  query?: (params: URLSearchParams) => QueryResult<Input>;
  run: (
    api: ApiClient,
    request: { ids: Readonly<Record<IdName, string>>; input: Input },
  ) => Promise<Result>;
  successStatus?: 200 | 201;
  /**
   * The JSON body cap for this operation, enforced on the streamed bytes and again on the body
   * forwarded to the API. Library writes use 32 KiB; note writes use the API's own 100 kB.
   */
  maxBodyBytes?: number;
}

export interface RouteContext {
  params: Promise<Record<string, string | string[] | undefined>>;
}

/** The exported route handler: the runtime comes from validated configuration. */
export function libraryRoute<Input, Result, IdName extends string>(
  method: LibraryMethod,
  operation: LibraryOperation<Input, Result, IdName>,
) {
  return async (request: NextRequest, context: RouteContext): Promise<NextResponse> => {
    let runtime: BffRuntime;
    try {
      runtime = getBffRuntime();
    } catch (error) {
      if (!(error instanceof BffConfigError)) throw error;
      logEvent('error', 'bff.config_invalid', { reason: error.message });
      return serviceUnavailableResponse();
    }
    return handleLibraryOperation(request, runtime, await context.params, method, operation);
  };
}

export async function handleLibraryOperation<Input, Result, IdName extends string>(
  request: NextRequest,
  runtime: BffRuntime,
  params: Record<string, string | string[] | undefined>,
  method: LibraryMethod,
  operation: LibraryOperation<Input, Result, IdName>,
): Promise<NextResponse> {
  if (method !== 'GET') {
    const rejected = rejectUnsafeMutation(
      request,
      runtime.config.appOrigin,
      operation.body ? { kind: 'json', maxBytes: bodyLimitOf(operation) } : { kind: 'none' },
    );
    if (rejected) return rejected;
  }

  const ids = {} as Record<IdName, string>;
  const badIds: BffFieldError[] = [];
  for (const name of operation.ids ?? []) {
    const value = params[name];
    if (isObjectId(value)) ids[name] = value.toLowerCase();
    else badIds.push({ field: name, message: 'must be a 24-character hexadecimal id' });
  }
  if (badIds.length > 0) return validationFailed(badIds);

  const input = await readInput(request, operation);
  if (isErrorResponse(input)) return input;

  const sessionSecret = request.cookies.get(sessionCookieName(runtime.config.isHttps))?.value;
  if (!sessionSecret) return unauthenticated(runtime, false);

  let result: Result;
  try {
    result = await runtime.sessions.callAsReader(sessionSecret, (accessToken) =>
      operation.run(readerApiClient(runtime, accessToken), { ids, input }),
    );
  } catch (error) {
    return failureResponse(error, runtime);
  }
  return result === undefined
    ? noContentResponse()
    : dataResponse(result, operation.successStatus ?? 200);
}

function bodyLimitOf(operation: { maxBodyBytes?: number }): number {
  return operation.maxBodyBytes ?? MAX_LIBRARY_REQUEST_BYTES;
}

export function readerApiClient(runtime: BffRuntime, accessToken: string): ApiClient {
  return createApiClient({ baseUrl: runtime.config.apiBaseUrl, getAccessToken: () => accessToken });
}

async function readInput<Input, Result, IdName extends string>(
  request: NextRequest,
  operation: LibraryOperation<Input, Result, IdName>,
): Promise<Input | NextResponse> {
  if (operation.query) {
    const parsed = operation.query(request.nextUrl.searchParams);
    return parsed.ok ? parsed.value : errorResponse(400, parsed.error);
  }
  if (!operation.body) {
    // Operations without a body must receive none: read (capped) and require it to be empty.
    const body = await readBodyText(request, MAX_LIBRARY_REQUEST_BYTES);
    if (isErrorResponse(body)) return body;
    return body.length === 0
      ? (undefined as Input)
      : errorResponse(400, { code: 'VALIDATION_ERROR', message: 'This request takes no body.' });
  }

  const maxBytes = bodyLimitOf(operation);
  const body = await readJsonBody(request, maxBytes);
  if (isErrorResponse(body)) return body;
  const parsed = operation.body.safeParse(body);
  if (!parsed.success) {
    return validationFailed(
      parsed.error.issues.map((issue) => ({
        field: fieldNameOf(issue.path),
        message: issue.code === 'unrecognized_keys' ? 'contains an unknown field' : issue.message,
      })),
    );
  }
  // The API counts the bytes it receives, which the BFF re-serialises: check those too.
  if (Buffer.byteLength(JSON.stringify(parsed.data), 'utf8') > maxBytes) {
    return errorResponse(413, PAYLOAD_TOO_LARGE);
  }
  return parsed.data;
}

/** `progress.value` for nested fields; array positions are dropped (`authors.3` → `authors`). */
function fieldNameOf(path: readonly PropertyKey[]): string {
  const names = path.filter((part): part is string => typeof part === 'string');
  return names.length > 0 ? names.join('.') : 'body';
}

const PAYLOAD_TOO_LARGE: BffError = {
  code: 'PAYLOAD_TOO_LARGE',
  message: 'The request is too large.',
};

function validationFailed(fields: BffFieldError[]): NextResponse {
  return errorResponse(400, {
    code: 'VALIDATION_ERROR',
    message: 'Some details need correcting.',
    fields,
  });
}

function unauthenticated(runtime: BffRuntime, clearCookie: boolean): NextResponse {
  const response = errorResponse(401, { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' });
  if (clearCookie) response.cookies.set(expiredSessionCookie(runtime.config.isHttps));
  return response;
}

/** API 404 messages are fixed strings that never reveal whether another reader's record exists. */
const NOT_FOUND_MESSAGES = new Set([
  'Book not found',
  'Copy not found',
  'Location not found',
  'Category not found',
  'Collection not found',
  'Wishlist item not found',
  'Reading session not found',
  'Note not found',
  'Loan not found',
]);

const CONFLICTS: Partial<Record<string, { code: BffErrorCode; message: string }>> = {
  BOOK_HAS_PHYSICAL_COPIES: {
    code: 'BOOK_HAS_PHYSICAL_COPIES',
    message: 'This book has (or once had) physical copies, so it cannot become an ebook.',
  },
  BOOK_NOT_PHYSICAL: {
    code: 'BOOK_NOT_PHYSICAL',
    message: 'Physical copies can only be added to physical books.',
  },
  WISHLIST_ALREADY_ACQUIRED: {
    code: 'WISHLIST_ALREADY_ACQUIRED',
    message: 'This wish was already acquired with a different book.',
  },
  READING_SESSION_IN_PROGRESS: {
    code: 'READING_SESSION_IN_PROGRESS',
    message: 'You’re already reading this book.',
  },
  INVALID_READING_TRANSITION: {
    code: 'INVALID_READING_TRANSITION',
    message: 'A finished reading can’t be reopened. Start a new reading to reread the book.',
  },
  READING_SESSION_UPDATE_CONFLICT: {
    code: 'READING_SESSION_UPDATE_CONFLICT',
    message: 'This reading was being changed somewhere else at the same time.',
  },
  READING_SESSION_BOOK_MISMATCH: {
    code: 'READING_SESSION_BOOK_MISMATCH',
    message: 'That reading belongs to a different book.',
  },
  COPY_ALREADY_ON_LOAN: {
    code: 'COPY_ALREADY_ON_LOAN',
    message: 'This copy is already lent. Check its current loan before recording another.',
  },
  LOAN_ALREADY_RETURNED: {
    code: 'LOAN_ALREADY_RETURNED',
    message:
      'This loan was returned on a different date. To correct the recorded date, edit this returned loan.',
  },
  LOAN_UPDATE_CONFLICT: {
    code: 'LOAN_UPDATE_CONFLICT',
    message: 'This loan changed elsewhere. Review the latest details before saving.',
  },
};

const NAME_CONFLICT = /^An? (location|category|collection) with this name already exists$/;

export function failureResponse(error: unknown, runtime: BffRuntime): NextResponse {
  if (error instanceof SessionEndedError) return unauthenticated(runtime, true);
  if (error instanceof SessionUnavailableError) {
    return error.reason === 'rate-limited'
      ? rateLimited(error.retryAfterSeconds)
      : serviceUnavailableResponse();
  }
  if (error instanceof ApiError) return apiErrorResponse(error);
  if (isApiClientError(error)) {
    logEvent('warn', 'library.backend_unavailable', { reason: error.name });
    return serviceUnavailableResponse();
  }
  throw error;
}

function apiErrorResponse(error: ApiError): NextResponse {
  switch (error.status) {
    case 400:
      return validationFailed(error.details.map(({ field, message }) => ({ field, message })));
    case 404:
      return errorResponse(404, {
        code: 'NOT_FOUND',
        message: NOT_FOUND_MESSAGES.has(error.message) ? error.message : 'Not found',
      });
    case 409: {
      const known = CONFLICTS[error.code];
      if (known) return errorResponse(409, known);
      return errorResponse(409, {
        code: 'CONFLICT',
        message: NAME_CONFLICT.test(error.message)
          ? `${error.message}.`
          : 'This conflicts with something that already exists.',
      });
    }
    case 413:
      return errorResponse(413, PAYLOAD_TOO_LARGE);
    case 429:
      return rateLimited(error.retryAfterSeconds);
    default:
      logEvent('warn', 'library.backend_error', {
        status: error.status,
        requestId: error.requestId,
      });
      return serviceUnavailableResponse();
  }
}

function rateLimited(retryAfterSeconds: number | undefined): NextResponse {
  return errorResponse(429, {
    code: 'RATE_LIMITED',
    message: 'Too many requests. Please wait before trying again.',
    ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
  });
}
