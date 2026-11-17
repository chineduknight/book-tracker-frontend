'use client';

import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useUnsavedChanges } from '@/components/forms/use-unsaved-changes';
import { ActionError } from '@/components/library/action-error';
import { BookPicker, bookDetails } from '@/components/library/book-picker';
import { authorLine } from '@/components/library/book-summary';
import { useBffAction } from '@/components/library/use-bff-action';
import { useFocusFirstInvalid } from '@/components/library/use-focus-first-invalid';
import { UncertainSave } from '@/components/reading/uncertain-save';
import { Button, ButtonLink } from '@/components/ui/button';
import { InlineError } from '@/components/ui/inline-error';
import { readFormValues } from '@/lib/forms/read-form-values';
import { hasErrors, type FieldErrors } from '@/lib/library/form-values';
import type { Book } from '@/lib/library/types';
import {
  EMPTY_NOTE_FORM,
  newNotePayload,
  validateNoteForm,
  type NoteField,
  type NoteFormValues,
} from '@/lib/notes/note-form';
import {
  jsonByteLength,
  MAX_NOTE_REQUEST_BYTES,
  NOTE_KIND_LABELS,
  NOTE_KINDS,
  type NoteKind,
} from '@/lib/notes/rules';
import type { Note } from '@/lib/notes/types';
import { NoteTextFields, noteFieldOf } from './note-fields';
import { SessionSelect, type SessionChoices } from './session-select';

const KIND_DESCRIPTIONS: Record<NoteKind, string> = {
  note: 'Your own writing about the book.',
  highlight: 'A passage quoted from the book, with optional commentary.',
};

/**
 * Creates a note or highlight for one catalogue book, optionally linked to one of that book's
 * readings. The book can be changed on this page without losing anything typed; changing it only
 * clears the reading link, because a reading belongs to one book.
 */
export function NoteForm({
  initialBook,
  initialSessions,
  initialSessionId,
}: {
  initialBook: Book | null;
  initialSessions: SessionChoices | null;
  initialSessionId: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const [initial] = useState<NoteFormValues>({
    ...EMPTY_NOTE_FORM,
    readingSessionId: initialSessionId,
  });
  const [book, setBook] = useState<Book | null>(initialBook);
  const [bookChanged, setBookChanged] = useState(false);
  const [kind, setKind] = useState<NoteKind | ''>('');
  const [errors, setErrors] = useState<FieldErrors<NoteField>>({});
  const [bookError, setBookError] = useState(false);
  const [tooLarge, setTooLarge] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const { send, isPending, error, setError } = useBffAction();
  const guard = useUnsavedChanges(formRef, initial, 'this note');
  useFocusFirstInvalid(formRef, attempt, errorRef);

  // A kind chosen before the page became interactive still counts.
  useEffect(() => {
    if (formRef.current) setKind(readFormValues(formRef.current, initial).kind);
  }, [initial]);

  function fail(problems: FieldErrors<NoteField>) {
    setErrors(problems);
    setAttempt((count) => count + 1);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;
    setUncertain(false);
    setTooLarge(false);
    setError(null);
    const values = readFormValues(event.currentTarget, initial);
    const problems = validateNoteForm(book ? values : { ...values, readingSessionId: '' });
    setBookError(book === null);
    if (hasErrors(problems) || !book) return fail(problems);

    const payload = newNotePayload(values);
    if (jsonByteLength(payload) > MAX_NOTE_REQUEST_BYTES) {
      setTooLarge(true);
      return fail({});
    }
    const result = await send<Note>('POST', `/api/notes/books/${book.id}`, payload);
    if (!result) return;
    if (!result.ok) {
      if (result.status === 0 || result.error.code === 'SERVICE_UNAVAILABLE') setUncertain(true);
      const fieldErrors: FieldErrors<NoteField> = {};
      for (const { field, message } of result.error.fields ?? []) {
        const name = noteFieldOf(field);
        if (name) fieldErrors[name] = message;
      }
      if (result.error.code === 'READING_SESSION_BOOK_MISMATCH') {
        fieldErrors.readingSessionId = 'That reading belongs to a different book. Choose another.';
      }
      return fail(fieldErrors);
    }
    guard.release();
    router.push(`/notes/${result.data?.id}?notice=note-created` as Route);
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
          what="your note"
          checkHref={book ? `/notes?bookId=${book.id}` : '/notes'}
          checkLabel="Check your notes"
          errorRef={errorRef}
        />
      ) : tooLarge ? (
        <div ref={errorRef} tabIndex={-1} className="focus:outline-none">
          <InlineError title="This note is too large to save in one go.">
            <p>
              Together its text takes more than 100 kB, usually because of many special or control
              characters. Shorten it or split it into two notes. Nothing was sent.
            </p>
          </InlineError>
        </div>
      ) : (
        <ActionError error={error} errorRef={errorRef} />
      )}

      <section aria-labelledby="note-book-heading" className="flex flex-col gap-3">
        <h2 id="note-book-heading" className="text-sm font-medium text-ink">
          Book
        </h2>
        {book ? (
          <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-muted p-3 @md:flex-row @md:items-center @md:justify-between">
            <p className="flex min-w-0 flex-col text-sm break-words">
              <span className="font-medium text-ink">{book.title}</span>
              <span className="text-ink-muted">{authorLine(book.authors)}</span>
              <span className="text-xs text-ink-muted">{bookDetails(book)}</span>
            </p>
            <Button
              variant="secondary"
              className="shrink-0"
              onClick={() => {
                setBook(null);
                setBookChanged(true);
              }}
            >
              Choose a different book
            </Button>
          </div>
        ) : (
          <>
            {bookError ? (
              <p
                tabIndex={-1}
                data-invalid="true"
                className="text-xs font-medium text-danger focus:outline-none"
              >
                Choose the book this note is about.
              </p>
            ) : null}
            <BookPicker
              label="Which book is it about?"
              chooseLabel="Choose"
              onChoose={(chosen) => {
                setBook(chosen);
                setBookError(false);
              }}
            />
          </>
        )}
      </section>

      <fieldset
        className="flex min-w-0 flex-col gap-2"
        aria-describedby={errors.kind ? 'kind-error' : 'kind-hint'}
      >
        <legend className="mb-1 text-sm font-medium text-ink">Kind</legend>
        <p id="kind-hint" className="text-xs text-ink-muted">
          Chosen once: a note can’t later become a highlight, or the other way round.
        </p>
        <div className="flex flex-col gap-2 @md:flex-row">
          {NOTE_KINDS.map((value) => (
            <label
              key={value}
              className="flex min-h-11 flex-1 items-start gap-2 rounded-lg border border-line-strong bg-surface p-3 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
            >
              <input
                type="radio"
                name="kind"
                value={value}
                onChange={() => setKind(value)}
                data-invalid={errors.kind && value === 'note' ? 'true' : undefined}
                className="mt-0.5 size-4 accent-[var(--accent)]"
              />
              <span className="flex min-w-0 flex-col">
                <span className="font-medium text-ink">{NOTE_KIND_LABELS[value]}</span>
                <span className="text-ink-muted">{KIND_DESCRIPTIONS[value]}</span>
              </span>
            </label>
          ))}
        </div>
        {errors.kind ? (
          <p id="kind-error" className="text-xs font-medium text-danger">
            {errors.kind}
          </p>
        ) : null}
      </fieldset>

      <NoteTextFields kind={kind} initial={initial} errors={errors} />

      {book ? (
        <SessionSelect
          key={book.id}
          bookId={book.id}
          initial={book.id === initialBook?.id && !bookChanged ? initialSessions : null}
          defaultValue={book.id === initialBook?.id && !bookChanged ? initialSessionId : ''}
          error={errors.readingSessionId}
        />
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" aria-disabled={isPending}>
          {isPending ? 'Saving…' : kind === 'highlight' ? 'Save highlight' : 'Save note'}
        </Button>
        <ButtonLink
          href={(initialBook ? `/library/books/${initialBook.id}` : '/notes') as Route}
          variant="secondary"
        >
          Cancel
        </ButtonLink>
      </div>
      {guard.dialog}
    </form>
  );
}
