import type { BffError } from './errors';

function waitDescription(seconds: number | undefined): string {
  if (seconds === undefined || seconds <= 0) return 'Wait a little while and try again.';
  if (seconds < 90) return `Wait about ${seconds} seconds and try again.`;
  return `Wait about ${Math.ceil(seconds / 60)} minutes and try again.`;
}

/** A reader-facing title and next step for a failed BFF request. Never shows upstream text. */
export function describeBffError(error: BffError): { title: string; detail: string } {
  switch (error.code) {
    case 'VALIDATION_ERROR':
      return { title: 'Some details need correcting.', detail: 'Check the highlighted fields.' };
    case 'NOT_FOUND':
      return {
        title: 'This item could not be found.',
        detail: 'It may have been deleted. Reload the page to see the current state.',
      };
    case 'CONFLICT':
    case 'BOOK_HAS_PHYSICAL_COPIES':
    case 'BOOK_NOT_PHYSICAL':
    case 'WISHLIST_ALREADY_ACQUIRED':
      return { title: error.message, detail: 'Nothing was changed.' };
    case 'RATE_LIMITED':
      return { title: 'Too many requests.', detail: waitDescription(error.retryAfterSeconds) };
    case 'SERVICE_UNAVAILABLE':
      return {
        title: 'Avuneri can’t be reached right now.',
        detail: 'Nothing was changed. Please try again in a moment.',
      };
    case 'UNAUTHENTICATED':
      return { title: 'Your session has ended.', detail: 'Sign in again to continue.' };
    default:
      return { title: 'Your request couldn’t be sent.', detail: 'Reload the page and try again.' };
  }
}
