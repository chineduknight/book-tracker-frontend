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
    case 'INVALID_READING_TRANSITION':
      return { title: error.message, detail: 'Nothing was changed.' };
    case 'READING_SESSION_IN_PROGRESS':
      return {
        title: error.message,
        detail: 'A book has one reading in progress at a time. Continue it, or finish it first.',
      };
    case 'READING_SESSION_UPDATE_CONFLICT':
      return {
        title: error.message,
        detail: 'Your changes weren’t saved but are still here. Save again to retry.',
      };
    case 'READING_SESSION_BOOK_MISMATCH':
      return {
        title: error.message,
        detail: 'Choose a reading of this book, or save the note without one. Nothing was saved.',
      };
    case 'COPY_ALREADY_ON_LOAN':
      return { title: error.message, detail: 'Nothing was recorded. Your text is still here.' };
    case 'LOAN_ALREADY_RETURNED':
      return {
        title: error.message,
        detail: 'Nothing was changed. Reload to see the recorded date.',
      };
    case 'LOAN_UPDATE_CONFLICT':
      return {
        title: error.message,
        detail: 'Your changes weren’t saved but are still here. Reload in another tab to compare.',
      };
    case 'PAYLOAD_TOO_LARGE':
      return {
        title: 'This is too large to save.',
        detail: 'Shorten it and try again. Your text is still here.',
      };
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
