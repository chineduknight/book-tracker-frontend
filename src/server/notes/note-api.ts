import 'server-only';
import type { ApiClient } from '@/lib/api/client';
import type { Page } from '@/lib/api/contract';
import { apiPath } from '@/lib/api/path';
import type { NoteKind, NoteSort } from '@/lib/notes/rules';
import type { Note } from '@/lib/notes/types';
import { noteSchema, type CreateNote, type UpdateNote } from './note-schemas';

/** One function per notes endpoint; each validates the API's response. */
const parseNote = (data: unknown): Note => noteSchema.parse(data);

export interface NoteListQuery {
  page: number;
  limit: number;
  sort?: NoteSort | undefined;
  kind?: NoteKind | undefined;
  q?: string | undefined;
  chapter?: string | undefined;
  readingSessionId?: string | undefined;
  bookId?: string | undefined;
}

/** Global notes, optionally narrowed to one book (`bookId`) or one reading. */
export function listNotes(api: ApiClient, query: NoteListQuery): Promise<Page<Note>> {
  return api.getPage(apiPath`/notes`, {
    query: {
      page: query.page,
      limit: query.limit,
      sort: query.sort,
      kind: query.kind,
      q: query.q,
      chapter: query.chapter,
      readingSessionId: query.readingSessionId,
      bookId: query.bookId,
    },
    parse: parseNote,
  });
}

export function listBookNotes(
  api: ApiClient,
  bookId: string,
  query: Omit<NoteListQuery, 'bookId'>,
): Promise<Page<Note>> {
  return api.getPage(apiPath`/books/${bookId}/notes`, {
    query: {
      page: query.page,
      limit: query.limit,
      sort: query.sort,
      kind: query.kind,
      q: query.q,
      chapter: query.chapter,
      readingSessionId: query.readingSessionId,
    },
    parse: parseNote,
  });
}

export function getNote(api: ApiClient, noteId: string): Promise<Note> {
  return api.get(apiPath`/notes/${noteId}`, { parse: parseNote });
}

export function createNote(api: ApiClient, bookId: string, note: CreateNote): Promise<Note> {
  return api.post(apiPath`/books/${bookId}/notes`, { body: note, parse: parseNote });
}

export function updateNote(api: ApiClient, noteId: string, changes: UpdateNote): Promise<Note> {
  return api.patch(apiPath`/notes/${noteId}`, { body: changes, parse: parseNote });
}

/** Soft delete: the API keeps the record, and the note behaves as missing everywhere afterwards. */
export function deleteNote(api: ApiClient, noteId: string): Promise<void> {
  return api.delete(apiPath`/notes/${noteId}`);
}
