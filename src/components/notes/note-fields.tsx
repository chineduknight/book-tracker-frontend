'use client';

import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { FieldErrors } from '@/lib/library/form-values';
import type { NoteEditValues, NoteField } from '@/lib/notes/note-form';
import { NOTE_LIMITS, type NoteKind } from '@/lib/notes/rules';

export const NOTE_FIELDS: readonly NoteField[] = [
  'kind',
  'content',
  'title',
  'commentary',
  'chapter',
  'pageNumber',
  'readingSessionId',
];

export function noteFieldOf(field: string): NoteField | undefined {
  return (NOTE_FIELDS as readonly string[]).includes(field) ? (field as NoteField) : undefined;
}

/**
 * The text of a note or highlight, as uncontrolled fields (typing before the page is interactive
 * is kept). There is no length cap on the textarea itself, so a long paste is never silently cut:
 * the counter and the validation say when it is too long.
 */
export function NoteTextFields({
  kind,
  initial,
  errors,
}: {
  kind: NoteKind | '';
  initial: NoteEditValues;
  errors: FieldErrors<NoteField>;
}) {
  const [length, setLength] = useState(initial.content.trim().length);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  // Text typed before the page became interactive is counted as soon as it is.
  useEffect(() => {
    if (contentRef.current) setLength(contentRef.current.value.trim().length);
  }, []);
  const max = NOTE_LIMITS.content[kind === 'highlight' ? 'highlight' : 'note'];
  const isHighlight = kind === 'highlight';

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <Textarea
          label={isHighlight ? 'Quotation' : 'Your note'}
          ref={contentRef}
          name="content"
          hint={
            isHighlight
              ? 'The passage as it appears in the book, up to 5,000 characters. It is always shown exactly as typed.'
              : 'Your own words, up to 20,000 characters. Markdown is fine; it is shown as written, not turned into formatting.'
          }
          rows={isHighlight ? 6 : 12}
          defaultValue={initial.content}
          error={errors.content}
          onInput={(event) => setLength(event.currentTarget.value.trim().length)}
          aria-required="true"
        />
        <p className={`text-xs ${length > max ? 'font-medium text-danger' : 'text-ink-muted'}`}>
          {length.toLocaleString('en')} of {max.toLocaleString('en')} characters
        </p>
      </div>
      <Textarea
        label="Commentary (optional)"
        name="commentary"
        hint="Your thoughts on it, up to 5,000 characters, in Markdown if you like."
        rows={4}
        defaultValue={initial.commentary}
        error={errors.commentary}
      />
      <Input
        label="Title (optional)"
        name="title"
        hint="Up to 160 characters."
        defaultValue={initial.title}
        error={errors.title}
      />
      <div className="grid gap-5 sm:grid-cols-2 [&>*]:min-w-0">
        <Input
          label="Chapter (optional)"
          name="chapter"
          hint="Any label, e.g. “Chapter 3” or “Introduction”."
          defaultValue={initial.chapter}
          error={errors.chapter}
        />
        <Input
          label="Page (optional)"
          name="pageNumber"
          inputMode="numeric"
          autoComplete="off"
          hint="A page reference only; it doesn’t change your reading progress."
          defaultValue={initial.pageNumber}
          error={errors.pageNumber}
        />
      </div>
    </div>
  );
}
