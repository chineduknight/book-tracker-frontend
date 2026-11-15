import type { RefObject } from 'react';
import { InlineError } from '@/components/ui/inline-error';
import type { BffError } from '@/lib/bff/errors';
import { describeBffError } from '@/lib/bff/messages';

/** A failed write, announced and focusable. Field errors are shown on their fields instead. */
export function ActionError({
  error,
  errorRef,
}: {
  error: BffError | null;
  errorRef?: RefObject<HTMLDivElement | null>;
}) {
  if (!error) return null;
  const { title, detail } = describeBffError(error);
  return (
    <div ref={errorRef} tabIndex={-1} className="focus:outline-none">
      <InlineError title={title}>
        <p>{detail}</p>
      </InlineError>
    </div>
  );
}
