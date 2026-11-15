'use client';

import { useEffect, useRef, useState } from 'react';
import type { FieldErrors } from '@/lib/auth/credential-policy';
import type { SessionApiError } from '@/lib/auth/session-api';
import { postToSessionApi } from '@/lib/auth/session-client';
import { navigateTo } from '@/lib/navigation/hard-navigation';

type Status = 'idle' | 'submitting' | 'redirecting';

interface SessionFormOptions<Field extends string> {
  endpoint: string;
  fields: readonly Field[];
  validate: (values: Record<Field, string>) => FieldErrors<Field>;
  /** Already vetted by the server page (see safe-redirect.ts). */
  returnPath: string;
}

/**
 * Shared behaviour of the sign-in and registration forms: validate locally first, submit once,
 * show server feedback on the right field (or as a form error), and move focus to the first
 * problem so keyboard and screen-reader users land on it.
 */
export function useSessionForm<Field extends string>({
  endpoint,
  fields,
  validate,
  returnPath,
}: SessionFormOptions<Field>) {
  const [status, setStatus] = useState<Status>('idle');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<Field>>({});
  const [formError, setFormError] = useState<SessionApiError | null>(null);
  const inputRefs = useRef<Partial<Record<Field, HTMLInputElement | null>>>({});
  const formErrorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (formError) formErrorRef.current?.focus();
  }, [formError]);

  function focusFirstInvalid(errors: FieldErrors<Field>) {
    const first = fields.find((field) => errors[field]);
    if (first) inputRefs.current[first]?.focus();
  }

  function registerInput(field: Field) {
    return (element: HTMLInputElement | null) => {
      inputRefs.current[field] = element;
    };
  }

  /** Re-checks a field as it is corrected, but only once it has shown an error. */
  function revalidate(field: Field, values: Record<Field, string>) {
    if (!fieldErrors[field]) return;
    setFieldErrors((current) => ({ ...current, [field]: validate(values)[field] }));
  }

  async function submit(values: Record<Field, string>) {
    if (status !== 'idle') return;
    setFormError(null);
    const localErrors = validate(values);
    setFieldErrors(localErrors);
    if (fields.some((field) => localErrors[field])) {
      focusFirstInvalid(localErrors);
      return;
    }

    setStatus('submitting');
    const result = await postToSessionApi(endpoint, values);
    if (result.ok) {
      setStatus('redirecting');
      navigateTo(returnPath);
      return;
    }

    setStatus('idle');
    const serverErrors = fieldErrorsFrom(result.error, fields);
    setFieldErrors(serverErrors);
    if (result.error.code === 'VALIDATION_ERROR' && fields.some((field) => serverErrors[field])) {
      focusFirstInvalid(serverErrors);
      return;
    }
    setFormError(result.error);
  }

  return {
    status,
    isBusy: status !== 'idle',
    fieldErrors,
    formError,
    formErrorRef,
    registerInput,
    revalidate,
    submit,
  };
}

function fieldErrorsFrom<Field extends string>(
  error: SessionApiError,
  fields: readonly Field[],
): FieldErrors<Field> {
  const errors: FieldErrors<Field> = {};
  for (const { field, message } of error.fields ?? []) {
    if ((fields as readonly string[]).includes(field)) errors[field as Field] = message;
  }
  return errors;
}
