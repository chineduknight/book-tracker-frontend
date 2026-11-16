import type { FieldErrors } from '@/lib/library/form-values';
import { isObjectId } from '@/lib/library/rules';
import { NOTE_KINDS, NOTE_LIMITS, type NoteKind } from './rules';
import type { Note } from './types';

/** The fields a note can change after creation. `kind` and the reading link never change. */
export interface NoteEditValues {
  content: string;
  title: string;
  commentary: string;
  chapter: string;
  pageNumber: string;
}

export interface NoteFormValues extends NoteEditValues {
  /** Required on create; '' until chosen. */
  kind: NoteKind | '';
  /** '' for a book-level note. */
  readingSessionId: string;
}

export type NoteField = keyof NoteFormValues;

export const EMPTY_NOTE_EDIT: NoteEditValues = {
  content: '',
  title: '',
  commentary: '',
  chapter: '',
  pageNumber: '',
};

export const EMPTY_NOTE_FORM: NoteFormValues = {
  ...EMPTY_NOTE_EDIT,
  kind: '',
  readingSessionId: '',
};

export function noteEditValuesOf(note: Note): NoteEditValues {
  return {
    content: note.content,
    title: note.title ?? '',
    commentary: note.commentary ?? '',
    chapter: note.chapter ?? '',
    pageNumber: note.pageNumber === undefined ? '' : String(note.pageNumber),
  };
}

function isKind(value: string): value is NoteKind {
  return (NOTE_KINDS as readonly string[]).includes(value);
}

/** Only the ends are trimmed, as the API does: inner spaces, line breaks and punctuation stay. */
function textOf(value: string): string | undefined {
  const text = value.trim();
  return text.length > 0 ? text : undefined;
}

function pageNumberOf(value: string): number | undefined {
  const text = value.trim();
  return /^[0-9]+$/.test(text) ? Number(text) : undefined;
}

function lengthProblem(value: string, max: number): string | undefined {
  const length = value.trim().length;
  return length > max
    ? `Use at most ${max.toLocaleString('en')} characters (this has ${length.toLocaleString('en')}).`
    : undefined;
}

export function validateNoteEdit(values: NoteEditValues, kind: NoteKind): FieldErrors<NoteField> {
  const errors: FieldErrors<NoteField> = {};
  if (values.content.trim() === '') {
    errors.content =
      kind === 'highlight' ? 'Enter the passage you are quoting.' : 'Write something first.';
  } else {
    errors.content = lengthProblem(values.content, NOTE_LIMITS.content[kind]);
    if (errors.content && kind === 'highlight') {
      errors.content = `A highlight is a quotation of at most 5,000 characters (this has ${values.content.trim().length.toLocaleString('en')}). Save longer writing as a note.`;
    }
  }
  errors.title = lengthProblem(values.title, NOTE_LIMITS.title);
  errors.commentary = lengthProblem(values.commentary, NOTE_LIMITS.commentary);
  errors.chapter = lengthProblem(values.chapter, NOTE_LIMITS.chapter);
  const page = values.pageNumber.trim();
  if (page !== '') {
    const number = pageNumberOf(page);
    if (number === undefined || number < 1 || number > NOTE_LIMITS.pageNumber) {
      errors.pageNumber = 'Enter a page number from 1 to 100,000.';
    }
  }
  return errors;
}

export function validateNoteForm(values: NoteFormValues): FieldErrors<NoteField> {
  if (!isKind(values.kind)) {
    return {
      ...validateNoteEdit(values, 'note'),
      content: undefined,
      kind: 'Choose note or highlight.',
    };
  }
  const errors = validateNoteEdit(values, values.kind);
  if (values.readingSessionId !== '' && !isObjectId(values.readingSessionId)) {
    errors.readingSessionId = 'Choose a reading from the list.';
  }
  return errors;
}

export interface NewNotePayload {
  kind: NoteKind;
  content: string;
  title?: string;
  commentary?: string;
  chapter?: string;
  pageNumber?: number;
  /** null makes a book-level note. */
  readingSessionId: string | null;
}

/** Call only after validateNoteForm found no problems. */
export function newNotePayload(values: NoteFormValues): NewNotePayload {
  const payload: NewNotePayload = {
    kind: values.kind as NoteKind,
    content: values.content.trim(),
    readingSessionId: values.readingSessionId === '' ? null : values.readingSessionId,
  };
  for (const field of ['title', 'commentary', 'chapter'] as const) {
    const text = textOf(values[field]);
    if (text !== undefined) payload[field] = text;
  }
  const page = pageNumberOf(values.pageNumber);
  if (page !== undefined) payload.pageNumber = page;
  return payload;
}

export type NoteChanges = {
  content?: string;
  title?: string | null;
  commentary?: string | null;
  chapter?: string | null;
  pageNumber?: number | null;
};

/**
 * Only the fields the reader changed; `null` clears an optional one. `kind` and
 * `readingSessionId` are never sent: the API fixes them at creation.
 */
export function noteChanges(note: Note, values: NoteEditValues): NoteChanges {
  const changes: NoteChanges = {};
  const content = values.content.trim();
  if (content !== '' && content !== note.content) changes.content = content;
  for (const field of ['title', 'commentary', 'chapter'] as const) {
    const text = textOf(values[field]);
    if (text !== note[field]) changes[field] = text ?? null;
  }
  const page = pageNumberOf(values.pageNumber);
  if (page !== note.pageNumber) changes.pageNumber = page ?? null;
  return changes;
}
