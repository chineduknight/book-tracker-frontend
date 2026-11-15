/**
 * Shared HTTP envelope types for the Book Tracker API, from book-tracker-backend
 * `docs/api-contract.md`. Concrete endpoint DTOs are deliberately not duplicated here; each feature
 * milestone adds the DTOs (and, where it pays off, runtime schemas) for the endpoints it uses.
 */

/** Every route is served under this prefix; the configured base URL must end with it. */
export const API_PREFIX = '/api/v1';

/**
 * Top-level API resources a request path may start with. Anything else is rejected before a
 * request is made, so the client cannot be pointed at an arbitrary path.
 */
export const API_RESOURCES = [
  'health',
  'ready',
  'auth',
  'books',
  'copies',
  'locations',
  'reading-sessions',
  'notes',
  'categories',
  'collections',
  'wishlist',
  'loans',
  'dashboard',
  'export',
] as const;

export type ApiResource = (typeof API_RESOURCES)[number];

/** `{ "data": ... }` — a single resource or operation result. */
export interface DataEnvelope<T> {
  data: T;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** `{ "data": [...], "meta": { "pagination": ... } }` — a page of a collection. */
export interface PageEnvelope<T> {
  data: T[];
  meta: { pagination: Pagination };
}

/** What the client returns for a paginated request. */
export interface Page<T> {
  items: T[];
  pagination: Pagination;
}

/** Safe, field-level validation feedback. Submitted values are never echoed by the API. */
export interface ApiErrorDetail {
  field: string;
  message: string;
}

/** Error codes the backend documents today. Unknown codes are still accepted as strings. */
export type KnownApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_JSON'
  | 'UNAUTHENTICATED'
  | 'INVALID_CREDENTIALS'
  | 'INVALID_REFRESH_TOKEN'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'BOOK_NOT_PHYSICAL'
  | 'BOOK_HAS_PHYSICAL_COPIES'
  | 'READING_SESSION_IN_PROGRESS'
  | 'INVALID_READING_TRANSITION'
  | 'READING_SESSION_UPDATE_CONFLICT'
  | 'READING_SESSION_BOOK_MISMATCH'
  | 'WISHLIST_ALREADY_ACQUIRED'
  | 'COPY_ALREADY_ON_LOAN'
  | 'LOAN_ALREADY_RETURNED'
  | 'LOAN_UPDATE_CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'EXPORT_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE';

// `string & {}` keeps editor autocompletion for the known codes while allowing new ones.
export type ApiErrorCode = KnownApiErrorCode | (string & {});

/** `{ "error": { code, message, requestId?, details? } }` */
export interface ErrorEnvelope {
  error: {
    code: ApiErrorCode;
    message: string;
    requestId?: string;
    details?: ApiErrorDetail[];
  };
}

// --- Runtime envelope checks -------------------------------------------------------------------
// Small hand-written guards: the envelope is the only shape this layer validates, so a schema
// library would add a dependency without adding safety. Payload (`data`) shapes are checked by the
// optional `parse` function a caller passes to the client.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function readDataEnvelope(body: unknown): DataEnvelope<unknown> | undefined {
  if (!isRecord(body) || !('data' in body) || body.data === undefined) return undefined;
  return { data: body.data };
}

export function readPageEnvelope(body: unknown): PageEnvelope<unknown> | undefined {
  if (!isRecord(body) || !Array.isArray(body.data)) return undefined;
  const meta = body.meta;
  if (!isRecord(meta) || !isRecord(meta.pagination)) return undefined;
  const { page, limit, total, totalPages } = meta.pagination;
  if (
    !isNonNegativeInteger(page) ||
    !isNonNegativeInteger(limit) ||
    !isNonNegativeInteger(total) ||
    !isNonNegativeInteger(totalPages)
  ) {
    return undefined;
  }
  return { data: body.data, meta: { pagination: { page, limit, total, totalPages } } };
}

export function readErrorEnvelope(body: unknown): ErrorEnvelope | undefined {
  if (!isRecord(body) || !isRecord(body.error)) return undefined;
  const { code, message, requestId, details } = body.error;
  if (typeof code !== 'string' || code.length === 0 || typeof message !== 'string') {
    return undefined;
  }
  if (requestId !== undefined && typeof requestId !== 'string') return undefined;
  if (details !== undefined && !Array.isArray(details)) return undefined;

  const error: ErrorEnvelope['error'] = { code, message };
  if (requestId !== undefined) error.requestId = requestId;
  if (details !== undefined) {
    // Copy only the documented, safe fields of each detail.
    error.details = details.flatMap((detail) =>
      isRecord(detail) && typeof detail.field === 'string' && typeof detail.message === 'string'
        ? [{ field: detail.field, message: detail.message }]
        : [],
    );
  }
  return { error };
}
