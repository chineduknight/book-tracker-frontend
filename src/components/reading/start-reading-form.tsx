'use client';

import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useUnsavedChanges } from '@/components/forms/use-unsaved-changes';
import { ActionError } from '@/components/library/action-error';
import { useBffAction } from '@/components/library/use-bff-action';
import { useFocusFirstInvalid } from '@/components/library/use-focus-first-invalid';
import { Button, ButtonLink } from '@/components/ui/button';
import { sendToBff } from '@/lib/bff/bff-client';
import { readFormValues } from '@/lib/forms/read-form-values';
import { hasErrors, type FieldErrors } from '@/lib/library/form-values';
import {
  EMPTY_SESSION_FORM,
  newSessionPayload,
  validateSessionForm,
  type BookLengths,
  type SessionField,
  type SessionFormValues,
} from '@/lib/reading/session-form';
import type { ReadingOverview, ReadingSession } from '@/lib/reading/types';
import { describeProgress } from './reading-display';
import { SessionFields, sessionFieldOf } from './session-fields';
import { UncertainSave } from './uncertain-save';

type Mode = 'start' | 'finished';
type StartValues = SessionFormValues & { mode: Mode };

/**
 * Starts a new reading of a catalogue book (in progress), or records a read finished in the past
 * in one request. A book has at most one reading in progress: if one exists (perhaps started on
 * another device a moment ago) the reader is sent to it instead of creating a duplicate.
 */
export function StartReadingForm({
  bookId,
  lengths,
  activeSession,
}: {
  bookId: string;
  lengths: BookLengths;
  activeSession: ReadingSession | null;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const defaultMode: Mode = activeSession ? 'finished' : 'start';
  const [initial] = useState<StartValues>({ ...EMPTY_SESSION_FORM, mode: defaultMode });
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [errors, setErrors] = useState<FieldErrors<SessionField>>({});
  const [attempt, setAttempt] = useState(0);
  const [uncertain, setUncertain] = useState(false);
  const [existing, setExisting] = useState<ReadingSession | null>(null);
  const { send, isPending, error } = useBffAction();
  const guard = useUnsavedChanges(formRef, initial, 'this reading');
  useFocusFirstInvalid(formRef, attempt, errorRef);

  // A choice made before the page became interactive still counts.
  useEffect(() => {
    if (formRef.current) setMode(readFormValues(formRef.current, initial).mode);
  }, [initial]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;
    setUncertain(false);
    setExisting(null);
    const shown = readFormValues(event.currentTarget, initial);
    const values = shown.mode === 'start' ? { ...shown, completedOn: '' } : shown;
    const problems = validateSessionForm(values, {
      status: shown.mode === 'finished' ? 'completed' : 'in_progress',
      lengths,
    });
    setErrors(problems);
    if (hasErrors(problems)) {
      setAttempt((count) => count + 1);
      return;
    }
    const result = await send<ReadingSession>(
      'POST',
      `/api/reading/books/${bookId}/sessions`,
      newSessionPayload(values, shown.mode),
    );
    if (!result) return;
    if (!result.ok) {
      if (result.status === 0 || result.error.code === 'SERVICE_UNAVAILABLE') setUncertain(true);
      if (result.error.code === 'READING_SESSION_IN_PROGRESS') {
        const overview = await sendToBff<ReadingOverview>(
          'GET',
          `/api/reading/books/${bookId}/overview`,
        );
        if (overview.ok) setExisting(overview.data?.activeSession ?? null);
      }
      const fieldErrors: FieldErrors<SessionField> = {};
      for (const { field, message } of result.error.fields ?? []) {
        const name = sessionFieldOf(field);
        if (name) fieldErrors[name] = message;
      }
      setErrors(fieldErrors);
      setAttempt((count) => count + 1);
      return;
    }
    guard.release();
    const notice = shown.mode === 'finished' ? 'reading-recorded' : 'reading-started';
    router.push(`/reading/${result.data?.id}?notice=${notice}` as Route);
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
          what="this reading"
          checkHref={`/library/books/${bookId}`}
          checkLabel="Check this book’s readings"
          errorRef={errorRef}
        />
      ) : (
        <ActionError error={error} errorRef={errorRef} />
      )}
      {existing ? (
        <p className="text-sm">
          <ButtonLink href={`/reading/${existing.id}` as Route} variant="secondary">
            Continue your current reading ({describeProgress(existing.progress, lengths)})
          </ButtonLink>
        </p>
      ) : null}

      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-ink">What are you recording?</legend>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {(
            [
              ['start', 'Start reading now', 'A new reading, in progress until you finish it.'],
              [
                'finished',
                'A read I’ve already finished',
                'Recorded as finished straight away, with whatever details you remember.',
              ],
            ] as const
          ).map(([value, label, description]) => (
            <label
              key={value}
              className="flex min-h-11 flex-1 items-start gap-2 rounded-lg border border-line-strong bg-surface p-3 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:disabled]:opacity-60"
            >
              <input
                type="radio"
                name="mode"
                value={value}
                defaultChecked={defaultMode === value}
                disabled={value === 'start' && activeSession !== null}
                onChange={() => setMode(value)}
                className="mt-0.5 size-4 accent-[var(--accent)]"
              />
              <span className="flex min-w-0 flex-col">
                <span className="font-medium text-ink">{label}</span>
                <span className="text-ink-muted">
                  {value === 'start' && activeSession
                    ? 'Not available: this book already has a reading in progress.'
                    : description}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <SessionFields
        initial={initial}
        errors={errors}
        lengths={lengths}
        completedOn={mode === 'finished' ? 'shown' : 'hidden'}
      />

      <div className="flex flex-wrap gap-3">
        <Button type="submit" aria-disabled={isPending}>
          {isPending ? 'Saving…' : mode === 'finished' ? 'Record finished read' : 'Start reading'}
        </Button>
        <ButtonLink href={`/library/books/${bookId}` as Route} variant="secondary">
          Cancel
        </ButtonLink>
      </div>
      {guard.dialog}
    </form>
  );
}
