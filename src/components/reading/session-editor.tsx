'use client';

import type { Route } from 'next';
import { CircleCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { useUnsavedChanges } from '@/components/forms/use-unsaved-changes';
import { ActionError } from '@/components/library/action-error';
import { useBffAction } from '@/components/library/use-bff-action';
import { useFocusFirstInvalid } from '@/components/library/use-focus-first-invalid';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { readFormValues } from '@/lib/forms/read-form-values';
import { hasErrors, type FieldErrors } from '@/lib/library/form-values';
import {
  sessionChanges,
  sessionFormValuesOf,
  validateSessionForm,
  type BookLengths,
  type SessionChanges,
  type SessionField,
} from '@/lib/reading/session-form';
import type { ReadingSession } from '@/lib/reading/types';
import { SessionFields, sessionFieldOf } from './session-fields';

/**
 * Edits one reading. Only changed fields are sent (a no-op sends nothing); `null` clears. Finishing
 * is a separate, confirmed step that sends `status: completed` explicitly, with a finish date only
 * if the reader gives one. Reaching the last page or 100% never finishes a reading by itself.
 */
export function SessionEditor({
  session,
  lengths,
}: {
  session: ReadingSession;
  lengths: BookLengths;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const [initial] = useState(() => sessionFormValuesOf(session));
  const [errors, setErrors] = useState<FieldErrors<SessionField>>({});
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState('');
  const [isFinishing, setIsFinishing] = useState(false);
  const { send, isPending, error, setError } = useBffAction();
  const guard = useUnsavedChanges(formRef, initial, 'your changes to this reading');
  useFocusFirstInvalid(formRef, isFinishing ? 0 : attempt, errorRef);
  const isFinished = session.status === 'completed';

  function clearPendingFinishDate() {
    const input = formRef.current?.querySelector<HTMLInputElement>('input[name="completedOn"]');
    if (!input) return;
    input.value = '';
    // Keep the unsaved-changes guard in sync without discarding other session edits.
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function fail(problems: FieldErrors<SessionField>) {
    setErrors(problems);
    setAttempt((count) => count + 1);
  }

  async function patch(changes: SessionChanges, notice: string): Promise<boolean> {
    const result = await send<ReadingSession>(
      'PATCH',
      `/api/reading/sessions/${session.id}`,
      changes,
    );
    if (!result) return false;
    if (!result.ok) {
      const fieldErrors: FieldErrors<SessionField> = {};
      for (const { field, message } of result.error.fields ?? []) {
        const name = sessionFieldOf(field);
        if (name) fieldErrors[name] = message;
      }
      setErrors(fieldErrors);
      return false;
    }
    guard.release();
    router.replace(`/reading/${session.id}?notice=${notice}` as Route, { scroll: false });
    router.refresh();
    return true;
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;
    setStatus('');
    const shown = readFormValues(event.currentTarget, initial);
    // The finish date of a reading in progress is only offered when finishing.
    const values = isFinished ? shown : { ...shown, completedOn: initial.completedOn };
    const problems = validateSessionForm(values, { status: session.status, lengths });
    if (hasErrors(problems)) return fail(problems);
    setErrors({});
    const changes = sessionChanges(session, values);
    if (Object.keys(changes).length === 0) {
      setStatus('No changes to save.');
      return;
    }
    if (!(await patch(changes, 'reading-saved'))) setAttempt((count) => count + 1);
  }

  async function finish() {
    const form = formRef.current;
    if (!form || isPending) return;
    const values = readFormValues(form, initial);
    const problems = validateSessionForm(values, { status: 'completed', lengths });
    setErrors(problems);
    if (hasErrors(problems)) {
      // A problem with the finish date is shown in the dialog; anything else on the page.
      const onlyDate = Object.entries(problems).every(
        ([field, message]) => !message || field === 'completedOn',
      );
      if (!onlyDate) {
        setIsFinishing(false);
        setAttempt((count) => count + 1);
      }
      return;
    }
    const ok = await patch(sessionChanges(session, values, { finish: true }), 'reading-finished');
    if (ok) setIsFinishing(false);
  }

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={save}
      aria-busy={isPending}
      className="flex flex-col gap-6"
    >
      {isFinishing ? null : <ActionError error={error} errorRef={errorRef} />}
      <SessionFields
        initial={initial}
        errors={isFinishing ? { ...errors, completedOn: undefined } : errors}
        lengths={lengths}
        completedOn={isFinished ? 'shown' : 'absent'}
      />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" aria-disabled={isPending}>
          {isPending && !isFinishing ? 'Saving…' : 'Save changes'}
        </Button>
        {isFinished ? null : (
          <Button
            variant="secondary"
            className="min-w-0 max-w-full"
            onClick={() => {
              setError(null);
              setErrors({});
              clearPendingFinishDate();
              setIsFinishing(true);
            }}
          >
            <CircleCheck aria-hidden="true" className="size-4 shrink-0" />
            <span className="min-w-0 wrap-anywhere">Mark as finished…</span>
          </Button>
        )}
      </div>
      <p role="status" className="text-sm text-ink-muted">
        {status}
      </p>

      {isFinished ? null : (
        <ConfirmDialog
          open={isFinishing}
          title="Mark this reading as finished?"
          tone="primary"
          confirmLabel="Mark as finished"
          pendingLabel="Saving…"
          isPending={isPending}
          onConfirm={() => void finish()}
          onCancel={() => {
            clearPendingFinishDate();
            setIsFinishing(false);
          }}
          error={isFinishing ? <ActionError error={error} /> : null}
        >
          <div className="flex flex-col gap-4">
            <p>
              A finished reading can’t be reopened. To read this book again later, you’ll start a
              new reading and this one stays in your history. Any other changes on this page are
              saved at the same time.
            </p>
            <Input
              label="Finished on (optional)"
              name="completedOn"
              type="date"
              hint="Leave blank to record no date; none is filled in for you."
              defaultValue=""
              error={errors.completedOn}
              onKeyDown={(event) => {
                // Enter here confirms finishing, never the page's plain "Save changes".
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void finish();
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
