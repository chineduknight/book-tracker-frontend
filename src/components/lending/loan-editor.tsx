'use client';

import type { Route } from 'next';
import { Undo2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { useUnsavedChanges } from '@/components/forms/use-unsaved-changes';
import { ActionError } from '@/components/library/action-error';
import { useBffAction } from '@/components/library/use-bff-action';
import { useFocusFirstInvalid } from '@/components/library/use-focus-first-invalid';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { formatCalendarDate } from '@/lib/dates/calendar-date';
import { readFormValues } from '@/lib/forms/read-form-values';
import { hasErrors, type FieldErrors } from '@/lib/library/form-values';
import {
  loanChanges,
  loanFormValuesOf,
  returnDateProblem,
  validateLoanForm,
  type LoanField,
  type LoanFormValues,
} from '@/lib/lending/loan-form';
import type { Loan } from '@/lib/lending/types';
import { LoanFields, loanFieldOf } from './loan-fields';

function hasOtherEdits(current: LoanFormValues, initial: LoanFormValues): boolean {
  return (Object.keys(initial) as LoanField[]).some(
    (field) => field !== 'returnedOn' && current[field] !== initial[field],
  );
}

/**
 * Corrects a loan (PATCH of changed fields only; `null` clears) and, while it is active, records its
 * return in a separate confirmed step that sends exactly `{ returnedOn }` with a day the reader
 * chose. A returned loan can have its return day corrected, but never becomes active again.
 */
export function LoanEditor({ loan }: { loan: Loan }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const [initial] = useState(() => loanFormValuesOf(loan));
  const [errors, setErrors] = useState<FieldErrors<LoanField>>({});
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState('');
  const [isReturning, setIsReturning] = useState(false);
  const [returnProblem, setReturnProblem] = useState<string | undefined>();
  const [editsPending, setEditsPending] = useState(false);
  const { send, isPending, error, setError } = useBffAction();
  const guard = useUnsavedChanges(formRef, initial, 'your changes to this loan');
  useFocusFirstInvalid(formRef, isReturning ? 0 : attempt, errorRef);
  const isReturned = loan.returnedOn !== null;

  function clearPendingReturnDate() {
    const input = formRef.current?.querySelector<HTMLInputElement>(
      'dialog input[name="returnedOn"]',
    );
    if (!input) return;
    input.value = '';
    // Keep the unsaved-changes guard in sync without touching the loan's other edits.
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function fieldErrorsOf(fields: Array<{ field: string; message: string }> | undefined) {
    const fieldErrors: FieldErrors<LoanField> = {};
    for (const { field, message } of fields ?? []) {
      const name = loanFieldOf(field);
      if (name) fieldErrors[name] = message;
    }
    return fieldErrors;
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;
    setStatus('');
    const shown = readFormValues(event.currentTarget, initial);
    // An active loan's return day is only set through "Mark returned".
    const values = isReturned ? shown : { ...shown, returnedOn: '' };
    const problems = validateLoanForm(values, { returned: isReturned });
    setErrors(problems);
    if (hasErrors(problems)) {
      setAttempt((count) => count + 1);
      return;
    }
    const changes = loanChanges(loan, values);
    if (Object.keys(changes).length === 0) {
      setStatus('No changes to save.');
      return;
    }
    const result = await send<Loan>('PATCH', `/api/lending/loans/${loan.id}`, changes);
    if (!result) return;
    if (!result.ok) {
      setErrors(fieldErrorsOf(result.error.fields));
      setAttempt((count) => count + 1);
      return;
    }
    guard.release();
    router.replace(`/lending/${loan.id}?notice=loan-saved` as Route, { scroll: false });
    router.refresh();
  }

  function openReturn() {
    const form = formRef.current;
    if (!form) return;
    setError(null);
    setReturnProblem(undefined);
    clearPendingReturnDate();
    setEditsPending(hasOtherEdits(readFormValues(form, initial), initial));
    setIsReturning(true);
  }

  async function confirmReturn() {
    const form = formRef.current;
    if (!form || isPending) return;
    if (editsPending) {
      setReturnProblem(
        'Save or undo your other changes first: recording the return reloads this loan.',
      );
      return;
    }
    const { returnedOn } = readFormValues(form, initial);
    const problem = returnDateProblem(returnedOn, loan.lentOn);
    setReturnProblem(problem);
    if (problem) return;
    const result = await send<Loan>('PUT', `/api/lending/loans/${loan.id}/return`, { returnedOn });
    if (!result?.ok) {
      if (result && !result.ok) setReturnProblem(fieldErrorsOf(result.error.fields).returnedOn);
      return;
    }
    guard.release();
    setIsReturning(false);
    router.replace(`/lending/${loan.id}?notice=loan-returned` as Route, { scroll: false });
    router.refresh();
  }

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={save}
      aria-busy={isPending}
      className="flex flex-col gap-6"
    >
      {isReturning ? null : <ActionError error={error} errorRef={errorRef} />}
      <LoanFields initial={initial} errors={errors} showReturnedOn={isReturned} />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" aria-disabled={isPending} className="min-w-0 max-w-full">
          {isPending && !isReturning ? 'Saving…' : 'Save changes'}
        </Button>
        {isReturned ? null : (
          <Button variant="secondary" className="min-w-0 max-w-full" onClick={openReturn}>
            <Undo2 aria-hidden="true" className="size-4 shrink-0" />
            <span className="min-w-0 wrap-anywhere">Mark returned…</span>
          </Button>
        )}
      </div>
      <p role="status" className="text-sm text-ink-muted">
        {status}
      </p>

      {isReturned ? null : (
        <ConfirmDialog
          open={isReturning}
          title="Mark this loan as returned?"
          tone="primary"
          confirmLabel="Mark returned"
          pendingLabel="Saving…"
          isPending={isPending}
          onConfirm={() => void confirmReturn()}
          onCancel={() => {
            clearPendingReturnDate();
            setIsReturning(false);
          }}
          error={isReturning ? <ActionError error={error} /> : null}
        >
          <div className="flex flex-col gap-4">
            <p>
              This can’t be undone: a returned loan stays in the copy’s history and the copy becomes
              free for a new loan. You can still correct the return day afterwards. Lent on{' '}
              {formatCalendarDate(loan.lentOn)}.
            </p>
            {editsPending ? (
              <p className="font-medium text-ink">
                You have unsaved changes to this loan. Save or undo them first: recording the return
                reloads it.
              </p>
            ) : null}
            <Input
              label="Returned on"
              name="returnedOn"
              type="date"
              hint="The day it came back. Nothing is filled in for you."
              defaultValue=""
              error={returnProblem}
              aria-required="true"
              onKeyDown={(event) => {
                // Enter here confirms the return, never the page's "Save changes".
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void confirmReturn();
                }
              }}
            />
          </div>
        </ConfirmDialog>
      )}
      {guard.dialog}
    </form>
  );
}
