'use client';

import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { useUnsavedChanges } from '@/components/forms/use-unsaved-changes';
import { ActionError } from '@/components/library/action-error';
import { useBffAction } from '@/components/library/use-bff-action';
import { useFocusFirstInvalid } from '@/components/library/use-focus-first-invalid';
import { UncertainSave } from '@/components/reading/uncertain-save';
import { Button, ButtonLink } from '@/components/ui/button';
import { sendToBff } from '@/lib/bff/bff-client';
import { readFormValues } from '@/lib/forms/read-form-values';
import { hasErrors, type FieldErrors } from '@/lib/library/form-values';
import {
  EMPTY_LOAN_FORM,
  newLoanPayload,
  validateLoanForm,
  type LoanField,
} from '@/lib/lending/loan-form';
import type { CopyLoanOverview, Loan } from '@/lib/lending/types';
import { LoanFields, loanFieldOf } from './loan-fields';

/**
 * Records a loan of one specific physical copy. The API decides, at submit time, whether the copy
 * is free: a loan recorded meanwhile elsewhere is a 409 that links to it, and a request whose
 * outcome is unknown is never retried automatically (creating a loan is not idempotent).
 */
export function NewLoanForm({ copyId, bookId }: { copyId: string; bookId: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const [initial] = useState(EMPTY_LOAN_FORM);
  const [errors, setErrors] = useState<FieldErrors<LoanField>>({});
  const [attempt, setAttempt] = useState(0);
  const [uncertain, setUncertain] = useState(false);
  const [current, setCurrent] = useState<Loan | null>(null);
  const { send, isPending, error, setError } = useBffAction();
  const guard = useUnsavedChanges(formRef, initial, 'this loan');
  useFocusFirstInvalid(formRef, attempt, errorRef);

  function fail(problems: FieldErrors<LoanField>) {
    setErrors(problems);
    setAttempt((count) => count + 1);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;
    setUncertain(false);
    setCurrent(null);
    setError(null);
    const values = readFormValues(event.currentTarget, initial);
    const problems = validateLoanForm(values, { returned: false });
    if (hasErrors(problems)) return fail(problems);

    const result = await send<Loan>(
      'POST',
      `/api/lending/copies/${copyId}/loans`,
      newLoanPayload(values),
    );
    if (!result) return;
    if (!result.ok) {
      if (result.status === 0 || result.error.code === 'SERVICE_UNAVAILABLE') setUncertain(true);
      if (result.error.code === 'COPY_ALREADY_ON_LOAN') {
        const overview = await sendToBff<CopyLoanOverview>(
          'GET',
          `/api/lending/copies/${copyId}/overview`,
        );
        if (overview.ok) setCurrent(overview.data?.activeLoan ?? null);
      }
      const fieldErrors: FieldErrors<LoanField> = {};
      for (const { field, message } of result.error.fields ?? []) {
        const name = loanFieldOf(field);
        if (name) fieldErrors[name] = message;
      }
      return fail(fieldErrors);
    }
    guard.release();
    router.push(`/lending/${result.data?.id}?notice=loan-created` as Route);
    router.refresh();
  }

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={submit}
      aria-busy={isPending}
      className="flex flex-col gap-6"
    >
      {uncertain ? (
        <UncertainSave
          what="the loan"
          checkHref={`/lending/copies/${copyId}`}
          checkLabel="Check this copy’s loans"
          errorRef={errorRef}
        />
      ) : (
        <ActionError error={error} errorRef={errorRef} />
      )}
      {current ? (
        <p>
          <ButtonLink href={`/lending/${current.id}` as Route} variant="secondary">
            Open the current loan
          </ButtonLink>
        </p>
      ) : null}
      <LoanFields initial={initial} errors={errors} />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" aria-disabled={isPending}>
          {isPending ? 'Saving…' : 'Record loan'}
        </Button>
        <ButtonLink href={`/library/books/${bookId}` as Route} variant="secondary">
          Cancel
        </ButtonLink>
      </div>
      {guard.dialog}
    </form>
  );
}
