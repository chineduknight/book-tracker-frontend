import { describe, expect, it } from 'vitest';
import {
  EMPTY_NOTE_FORM,
  newNotePayload,
  noteChanges,
  noteEditValuesOf,
  validateNoteEdit,
  validateNoteForm,
} from './note-form';
import { jsonByteLength, MAX_NOTE_REQUEST_BYTES } from './rules';
import type { Note } from './types';

const NOW = '2026-11-15T10:00:00.000Z';
const note: Note = {
  id: 'a'.repeat(24),
  bookId: 'b'.repeat(24),
  readingSessionId: 'c'.repeat(24),
  kind: 'highlight',
  content: 'It is a truth universally acknowledged',
  title: 'Opening',
  chapter: 'Chapter 1',
  pageNumber: 1,
  createdAt: NOW,
  updatedAt: NOW,
};

describe('validation by kind', () => {
  it('requires a kind and content on create', () => {
    const errors = validateNoteForm(EMPTY_NOTE_FORM);
    expect(errors.kind).toBe('Choose note or highlight.');
    expect(validateNoteForm({ ...EMPTY_NOTE_FORM, kind: 'note', content: '  \n ' }).content).toBe(
      'Write something first.',
    );
  });

  it('allows 20,000 characters for a note and 5,000 for a highlight', () => {
    expect(
      validateNoteEdit({ ...noteEditValuesOf(note), content: 'x'.repeat(20_000) }, 'note').content,
    ).toBeUndefined();
    expect(
      validateNoteEdit({ ...noteEditValuesOf(note), content: 'x'.repeat(20_001) }, 'note').content,
    ).toMatch(/at most 20,000/);
    expect(
      validateNoteEdit({ ...noteEditValuesOf(note), content: 'x'.repeat(5_000) }, 'highlight')
        .content,
    ).toBeUndefined();
    expect(
      validateNoteEdit({ ...noteEditValuesOf(note), content: 'x'.repeat(5_001) }, 'highlight')
        .content,
    ).toMatch(/Save longer writing as a note/);
  });

  it.each([
    ['title', 'x'.repeat(161)],
    ['commentary', 'x'.repeat(5_001)],
    ['chapter', 'x'.repeat(201)],
    ['pageNumber', '0'],
    ['pageNumber', '100001'],
    ['pageNumber', '12a'],
  ] as const)('limits %s', (field, value) => {
    expect(
      validateNoteEdit({ ...noteEditValuesOf(note), [field]: value }, 'note')[field],
    ).toBeTruthy();
  });

  it('refuses a reading id that is not one from the list', () => {
    expect(
      validateNoteForm({ ...EMPTY_NOTE_FORM, kind: 'note', content: 'x', readingSessionId: '../x' })
        .readingSessionId,
    ).toBeTruthy();
  });
});

describe('newNotePayload', () => {
  it('trims only the ends, keeping line breaks, spacing and punctuation exactly', () => {
    const content = '\n  # Heading\n\n  indented   “quoted” — text\t\n\n';
    const payload = newNotePayload({
      ...EMPTY_NOTE_FORM,
      kind: 'note',
      content,
      commentary: '   ',
    });
    expect(payload).toEqual({ kind: 'note', content: content.trim(), readingSessionId: null });
    expect(payload.content).toContain('\n\n  indented   “quoted”');
  });

  it('links a reading only when one is chosen', () => {
    expect(
      newNotePayload({
        ...EMPTY_NOTE_FORM,
        kind: 'highlight',
        content: 'q',
        readingSessionId: note.readingSessionId ?? '',
        pageNumber: ' 42 ',
        chapter: ' Ch. 2 ',
      }),
    ).toEqual({
      kind: 'highlight',
      content: 'q',
      readingSessionId: note.readingSessionId,
      pageNumber: 42,
      chapter: 'Ch. 2',
    });
  });
});

describe('noteChanges', () => {
  it('sends nothing when nothing changed', () => {
    expect(noteChanges(note, noteEditValuesOf(note))).toEqual({});
    expect(
      noteChanges(note, { ...noteEditValuesOf(note), content: `  ${note.content}\n` }),
    ).toEqual({});
  });

  it('clears optional fields with null and never sends kind or the reading link', () => {
    const changes = noteChanges(note, {
      ...noteEditValuesOf(note),
      title: '',
      chapter: ' ',
      pageNumber: '',
      commentary: 'New thought',
    });
    expect(changes).toEqual({
      title: null,
      chapter: null,
      pageNumber: null,
      commentary: 'New thought',
    });
    expect(changes).not.toHaveProperty('kind');
    expect(changes).not.toHaveProperty('readingSessionId');
  });

  it('never clears content', () => {
    expect(noteChanges(note, { ...noteEditValuesOf(note), content: '' })).not.toHaveProperty(
      'content',
    );
  });
});

describe('request size', () => {
  it('counts UTF-8 bytes of the JSON, so a maximal multibyte note still fits under 100 kB', () => {
    const body = { kind: 'note', content: '€'.repeat(20_000), commentary: '€'.repeat(5_000) };
    expect(jsonByteLength(body)).toBeGreaterThan(32 * 1024);
    expect(jsonByteLength(body)).toBeLessThan(MAX_NOTE_REQUEST_BYTES);
    expect(jsonByteLength({ content: '\u0001'.repeat(20_000) })).toBeGreaterThan(
      MAX_NOTE_REQUEST_BYTES,
    );
  });
});
