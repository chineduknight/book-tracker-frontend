import type { RefObject } from 'react';
import { InlineError } from '@/components/ui/inline-error';
import type { SessionApiError } from '@/lib/auth/session-api';

function waitDescription(seconds: number | undefined): string {
  if (seconds === undefined || seconds <= 0) return 'Wait a little while and try again.';
  if (seconds < 90) return `Wait about ${seconds} seconds and try again.`;
  return `Wait about ${Math.ceil(seconds / 60)} minutes and try again.`;
}

function describe(error: SessionApiError): { title: string; detail: string } {
  switch (error.code) {
    case 'INVALID_CREDENTIALS':
      return { title: 'Email or password is incorrect.', detail: 'Check both and try again.' };
    case 'EMAIL_TAKEN':
      return {
        title: 'An account with this email already exists.',
        detail: 'Sign in with it instead, or use another email address.',
      };
    case 'RATE_LIMITED':
      return { title: 'Too many attempts.', detail: waitDescription(error.retryAfterSeconds) };
    case 'SERVICE_UNAVAILABLE':
      return {
        title: 'Avuneri can’t be reached right now.',
        detail: 'Please try again in a moment.',
      };
    case 'VALIDATION_ERROR':
      return { title: 'Some details need correcting.', detail: 'Check the form and try again.' };
    default:
      return {
        title: 'Your request couldn’t be sent.',
        detail: 'Reload the page and try again.',
      };
  }
}

/** The form-level error, focused when it appears so it is read out and easy to find. */
export function FormError({
  error,
  errorRef,
}: {
  error: SessionApiError | null;
  errorRef: RefObject<HTMLDivElement | null>;
}) {
  if (!error) return null;
  const { title, detail } = describe(error);
  return (
    <div ref={errorRef} tabIndex={-1} className="focus:outline-none">
      <InlineError title={title}>
        <p>{detail}</p>
      </InlineError>
    </div>
  );
}
