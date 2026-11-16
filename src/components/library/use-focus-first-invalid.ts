'use client';

import { useEffect, useRef, type RefObject } from 'react';

/**
 * After a failed submit, moves focus to the first invalid field (or the form-level error), so
 * keyboard and screen-reader users land on the problem.
 */
export function useFocusFirstInvalid(
  formRef: RefObject<HTMLFormElement | null>,
  attempt: number,
  errorRef?: RefObject<HTMLDivElement | null>,
) {
  const handled = useRef(0);
  useEffect(() => {
    if (attempt === 0 || attempt === handled.current) return;
    handled.current = attempt;
    const invalid = formRef.current?.querySelector<HTMLElement>(
      '[aria-invalid="true"], [data-invalid="true"]',
    );
    (invalid ?? errorRef?.current)?.focus();
  });
}
