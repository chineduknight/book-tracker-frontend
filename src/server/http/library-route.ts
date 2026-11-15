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
      operation.body ? { kind: 'json', maxBytes: MAX_LIBRARY_REQUEST_BYTES } : { kind: 'none' },
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

  const body = await readJsonBody(request, MAX_LIBRARY_REQUEST_BYTES);
  if (isErrorResponse(body)) return body;
  const parsed = operation.body.safeParse(body);
  if (parsed.success) return parsed.data;
  return validationFailed(
    parsed.error.issues.map((issue) => ({
      field: typeof issue.path[0] === 'string' ? issue.path[0] : 'body',
      message: issue.code === 'unrecognized_keys' ? 'contains an unknown field' : issue.message,
    })),
  );
}

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
