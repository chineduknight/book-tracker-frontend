import type { Route } from 'next';
import Link from 'next/link';
import type { RefObject } from 'react';
import { InlineError } from '@/components/ui/inline-error';

/**
 * A create whose outcome is unknown (no response, or the API was unreachable mid-request). It may
 * or may not have been saved, so it is never retried automatically and never reported as either.
 */
export function UncertainSave({
  what,
  checkHref,
  checkLabel,
  errorRef,
}: {
  what: string;
  checkHref: string;
  checkLabel: string;
  errorRef?: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div ref={errorRef} tabIndex={-1} className="focus:outline-none">
      <InlineError title={`Avuneri couldn’t confirm whether ${what} was saved.`}>
        <p>
          The connection failed before an answer arrived. Your text is still here.{' '}
          <Link
            href={checkHref as Route}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline"
          >
            {checkLabel} (opens in a new tab)
          </Link>{' '}
          before saving again, so you don’t end up with a duplicate.
        </p>
      </InlineError>
    </div>
  );
}
