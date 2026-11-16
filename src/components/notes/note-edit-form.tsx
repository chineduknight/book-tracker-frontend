'use client';

import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { useUnsavedChanges } from '@/components/forms/use-unsaved-changes';
import { ActionError } from '@/components/library/action-error';
import { useBffAction } from '@/components/library/use-bff-action';
import { useFocusFirstInvalid } from '@/components/library/use-focus-first-invalid';
import { Button, ButtonLink } from '@/components/ui/button';
import { InlineError } from '@/components/ui/inline-error';
import { readFormValues } from '@/lib/forms/read-form-values';
import { hasErrors, type FieldErrors } from '@/lib/library/form-values';
import {
  noteChanges,
  noteEditValuesOf,
  validateNoteEdit,
  type NoteField,
} from '@/lib/notes/note-form';
import { jsonByteLength, MAX_NOTE_REQUEST_BYTES } from '@/lib/notes/rules';
import type { Note } from '@/lib/notes/types';
import { NoteTextFields, noteFieldOf } from './note-fields';

/**
 * Edits a note's text and labels. Only changed fields are sent; clearing an optional field sends
 * `null`. `kind` and the reading link are never sent: they are fixed when the note is created.
 */
export function NoteEditForm({ note }: { note: Note }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const [initial] = useState(() => noteEditValuesOf(note));
  const [errors, setErrors] = useState<FieldErrors<NoteField>>({});
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState('');
  const [problem, setProblem] = useState<'too-large' | 'uncertain' | null>(null);
  const { send, isPending, error, setError } = useBffAction();
  const guard = useUnsavedChanges(formRef, initial, 'your changes to this note');
  useFocusFirstInvalid(formRef, attempt, errorRef);

  function fail(problems: FieldErrors<NoteField>) {
    setErrors(problems);
    setAttempt((count) => count + 1);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;
    setStatus('');
    setProblem(null);
    setError(null);
    const values = readFormValues(event.currentTarget, initial);
    const problems = validateNoteEdit(values, note.kind);
    if (hasErrors(problems)) return fail(problems);
    setErrors({});
    const changes = noteChanges(note, values);
    if (Object.keys(changes).length === 0) {
      setStatus('No changes to save.');
      return;
    }
    if (jsonByteLength(changes) > MAX_NOTE_REQUEST_BYTES) {
      setProblem('too-large');
      return fail({});
    }
    const result = await send<Note>('PATCH', `/api/notes/${note.id}`, changes);
    if (!result) return;
    if (!result.ok) {
      if (result.status === 0 || result.error.code === 'SERVICE_UNAVAILABLE')
        setProblem('uncertain');
      const fieldErrors: FieldErrors<NoteField> = {};
      for (const { field, message } of result.error.fields ?? []) {
        const name = noteFieldOf(field);
        if (name) fieldErrors[name] = message;
      }
      return fail(fieldErrors);
    }
    guard.release();
    router.push(`/notes/${note.id}?notice=note-saved` as Route);
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
      {problem ? (
        <div ref={errorRef} tabIndex={-1} className="focus:outline-none">
          <InlineError
            title={
              problem === 'too-large'
                ? 'This note is too large to save in one go.'
                : 'Avuneri couldn’t confirm whether your changes were saved.'
            }
          >
            <p>
              {problem === 'too-large'
                ? 'Together its text takes more than 100 kB, usually because of many special or control characters. Shorten it. Nothing was sent.'
                : 'The connection failed before an answer arrived. Your text is still here, and saving again is safe.'}
            </p>
          </InlineError>
        </div>
      ) : (
        <ActionError error={error} errorRef={errorRef} />
      )}
      <NoteTextFields kind={note.kind} initial={initial} errors={errors} />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" aria-disabled={isPending}>
          {isPending ? 'Saving…' : 'Save changes'}
        </Button>
        <ButtonLink href={`/notes/${note.id}` as Route} variant="secondary">
          Cancel
        </ButtonLink>
      </div>
      <p role="status" className="text-sm text-ink-muted">
        {status}
      </p>
      {guard.dialog}
    </form>
  );
}
