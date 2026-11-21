'use client';

import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { Button, ButtonLink } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { WholeNumberInput } from '@/components/ui/whole-number-input';
import { Textarea } from '@/components/ui/textarea';
import {
  bookChanges,
  bookFormValuesOf,
  EMPTY_BOOK_FORM,
  newBookPayload,
  validateBookForm,
  type BookField,
  type BookFormValues,
} from '@/lib/library/book-form';
import { readFormValues } from '@/lib/forms/read-form-values';
import { hasErrors, type FieldErrors } from '@/lib/library/form-values';
import { BOOK_FORMATS, FORMAT_LABELS, LIMITS } from '@/lib/library/rules';
import type { Book } from '@/lib/library/types';
import { ActionError } from './action-error';
import { DuplicateSuggestions } from './duplicate-suggestions';
import { useBffAction } from './use-bff-action';
import { useFocusFirstInvalid } from './use-focus-first-invalid';

const FIELDS = Object.keys(EMPTY_BOOK_FORM) as BookField[];

/** Create (no `book`) or edit an existing catalogue entry. */
export function BookForm({ book }: { book?: Book }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const initial = book ? bookFormValuesOf(book) : EMPTY_BOOK_FORM;
  const [probe, setProbe] = useState({ title: initial.title, isbn: initial.isbn });
  const [selectedFormat, setSelectedFormat] = useState(initial.format);
  const [errors, setErrors] = useState<FieldErrors<BookField>>({});
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState('');
  const { send, isPending, error, setError } = useBffAction();
  useFocusFirstInvalid(formRef, attempt, errorRef);

  /** Fields are uncontrolled (see SignInForm); this only tracks what live UI needs. */
  function noteChange(event: FormEvent<HTMLFormElement>) {
    const changed: EventTarget = event.target;
    if (!(changed instanceof HTMLInputElement || changed instanceof HTMLTextAreaElement)) return;
    const field = FIELDS.find((name) => name === changed.name);
    if (!field) return;
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
    if (field === 'title' || field === 'isbn')
      setProbe((current) => ({ ...current, [field]: changed.value }));
    if (field === 'format') setSelectedFormat(changed.value as BookFormValues['format']);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;
    setStatus('');
    const values = readFormValues(event.currentTarget, initial);
    const problems = validateBookForm(values);
    setErrors(problems);
    if (hasErrors(problems)) {
      setAttempt((count) => count + 1);
      return;
    }

    const body = book ? bookChanges(book, values) : newBookPayload(values);
    if (book && Object.keys(body).length === 0) {
      setStatus('No changes to save.');
      return;
    }
    const result = await send<Book>(
      book ? 'PATCH' : 'POST',
      book ? `/api/library/books/${book.id}` : '/api/library/books',
      body,
    );
    if (!result) return;
    if (!result.ok) {
      const fieldErrors: FieldErrors<BookField> = {};
      for (const { field, message } of result.error.fields ?? []) {
        if ((FIELDS as string[]).includes(field)) fieldErrors[field as BookField] = message;
      }
      if (result.error.code === 'BOOK_HAS_PHYSICAL_COPIES')
        fieldErrors.format = result.error.message;
      setErrors(fieldErrors);
      setAttempt((count) => count + 1);
      return;
    }
    const saved = result.data;
    const destination = `/library/books/${saved?.id ?? book?.id}?notice=${book ? 'book-saved' : 'book-created'}`;
    router.push(destination as Route);
    router.refresh();
  }

  const formatLocked = error?.code === 'BOOK_HAS_PHYSICAL_COPIES';

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={submit}
      onChange={noteChange}
      aria-busy={isPending}
      className="flex flex-col gap-5"
    >
      <ActionError error={formatLocked ? null : error} errorRef={errorRef} />
      <Input
        label="Title"
        name="title"
        required
        maxLength={LIMITS.title}
        defaultValue={initial.title}
        error={errors.title}
      />
      <Textarea
        label="Authors (optional)"
        hint="One author per line, up to 20."
        name="authors"
        rows={2}
        defaultValue={initial.authors}
        error={errors.authors}
      />
      <fieldset
        className="flex flex-col gap-2"
        aria-describedby={errors.format ? 'format-error' : undefined}
      >
        <legend className="mb-1 text-sm font-medium text-ink">Format</legend>
        <div className="flex flex-wrap gap-3">
          {BOOK_FORMATS.map((format) => (
            <label
              key={format}
              className="flex min-h-11 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
            >
              <input
                type="radio"
                name="format"
                value={format}
                defaultChecked={initial.format === format}
                data-invalid={errors.format && selectedFormat === format ? 'true' : undefined}
                className="size-4 accent-[var(--accent)]"
              />
              {FORMAT_LABELS[format]}
            </label>
          ))}
        </div>
        {errors.format ? (
          <div id="format-error" className="flex flex-col gap-2 text-xs font-medium text-danger">
            <p>{errors.format}</p>
            {formatLocked ? (
              <div>
                <Button
                  variant="secondary"
                  className="min-h-9 text-xs"
                  onClick={() => {
                    const formats = formRef.current?.elements.namedItem('format');
                    if (formats instanceof RadioNodeList) formats.value = 'physical';
                    setSelectedFormat('physical');
                    setErrors((current) => ({ ...current, format: undefined }));
                    setError(null);
                  }}
                >
                  Keep it physical (your other edits are kept)
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </fieldset>
      <div className="grid gap-5 @md:grid-cols-2">
        <Input
          label="ISBN (optional)"
          name="isbn"
          maxLength={LIMITS.isbn}
          defaultValue={initial.isbn}
          error={errors.isbn}
        />
        <Input
          label="Edition (optional)"
          name="edition"
          maxLength={LIMITS.edition}
          defaultValue={initial.edition}
          error={errors.edition}
        />
        <WholeNumberInput
          label="Publication year (optional)"
          max={LIMITS.publicationYear}
          name="publicationYear"
          defaultValue={initial.publicationYear}
          error={errors.publicationYear}
        />
        <WholeNumberInput
          label="Pages (optional)"
          max={LIMITS.pageCount}
          name="pageCount"
          defaultValue={initial.pageCount}
          error={errors.pageCount}
        />
        <WholeNumberInput
          label="Chapters (optional)"
          max={LIMITS.chapterCount}
          name="chapterCount"
          defaultValue={initial.chapterCount}
          error={errors.chapterCount}
        />
        <Input
          label="Cover image address (optional)"
          hint="A link only; Avuneri does not download it."
          name="coverUrl"
          type="url"
          inputMode="url"
          maxLength={LIMITS.url}
          defaultValue={initial.coverUrl}
          error={errors.coverUrl}
        />
      </div>
      <Textarea
        label="Description (optional)"
        name="description"
        rows={5}
        maxLength={LIMITS.description}
        defaultValue={initial.description}
        error={errors.description}
      />
      <DuplicateSuggestions
        title={probe.title}
        isbn={probe.isbn}
        {...(book ? { excludeBookId: book.id } : {})}
      />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" aria-disabled={isPending}>
          {isPending ? 'Saving…' : book ? 'Save changes' : 'Add book'}
        </Button>
        <ButtonLink
          href={(book ? `/library/books/${book.id}` : '/library') as Route}
          variant="secondary"
        >
          Cancel
        </ButtonLink>
      </div>
      <p role="status" className="text-sm text-ink-muted">
        {status}
      </p>
    </form>
  );
}
