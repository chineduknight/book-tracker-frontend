'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { InlineError } from '@/components/ui/inline-error';
import type { BffError } from '@/lib/bff/errors';
import { describeBffError } from '@/lib/bff/messages';

/**
 * A failed write, announced and focusable. Field errors are shown on their fields instead.
 *
 * Each new error takes focus and is scrolled into view. Forms put it at the top while the submit
 * button is at the bottom, so on a phone an unfocused error would appear off-screen and the
 * reader would see only the button stop saying "Saving…".
 */
export function ActionError({
  error,
  errorRef,
}: {
  error: BffError | null;
  errorRef?: RefObject<HTMLDivElement | null>;
}) {
  const ownRef = useRef<HTMLDivElement>(null);
  const ref = errorRef ?? ownRef;

  useEffect(() => {
    const element = ref.current;
    if (!error || !element) return;
    element.focus({ preventScroll: true });
    element.scrollIntoView?.({ block: 'center' });
  }, [error, ref]);

  if (!error) return null;
  const { title, detail } = describeBffError(error);
  return (
    <div ref={ref} tabIndex={-1} className="focus:outline-none">
      <InlineError title={title}>
        <p>{detail}</p>
      </InlineError>
    </div>
  );
}
