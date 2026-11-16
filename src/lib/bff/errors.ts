/** The error envelope every BFF route returns: `{ "error": BffError }`. Messages are always safe. */
export type BffErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_TAKEN'
  | 'RATE_LIMITED'
  | 'UNAUTHENTICATED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'BOOK_HAS_PHYSICAL_COPIES'
  | 'BOOK_NOT_PHYSICAL'
  | 'WISHLIST_ALREADY_ACQUIRED'
  | 'SERVICE_UNAVAILABLE'
  | 'FORBIDDEN_ORIGIN'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'PAYLOAD_TOO_LARGE'
  | 'INVALID_JSON';

export interface BffFieldError {
  field: string;
  message: string;
}

export interface BffError {
  code: BffErrorCode;
  message: string;
  fields?: BffFieldError[];
  retryAfterSeconds?: number;
}
