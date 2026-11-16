import 'server-only';
import type { ApiClient } from '@/lib/api/client';
import type { Page } from '@/lib/api/contract';
import { ApiError } from '@/lib/api/errors';
import { PAGE_SIZE } from '@/lib/library/rules';
import type { Book } from '@/lib/library/types';
import type { NotesQuery } from '@/lib/notes/queries';
import type { Note } from '@/lib/notes/types';
import { getBook } from '../library/library-api';
import { lookUpBooks, orNullIfMissing } from '../reading/book-lookup';
import { listNotes } from './note-api';

export type NotesPage =
  | {
      status: 'ok';
      notes: Array<{ note: Note; book: Book | null }>;
      pagination: Page<Note>['pagination'];
      /** The book the list is narrowed to, for its heading. */
      filterBook: Book | null;
    }
  /** The book or reading in the filter is missing, foreign, deleted or from another book. */
  | { status: 'invalid-filter' };

/**
 * One page of the reader's notes with each row's book (one request per distinct book). A filter
 * naming a book or reading the reader can't see is reported as such, never as "no notes".
 */
export async function loadNotesPage(api: ApiClient, query: NotesQuery): Promise<NotesPage> {
  if (query.invalidFilter) return { status: 'invalid-filter' };
  let page: Page<Note>;
  try {
    page = await listNotes(api, {
      page: query.page,
      limit: PAGE_SIZE,
      sort: query.sort,
      kind: query.kind,
      q: query.q,
      chapter: query.chapter,
      bookId: query.bookId,
      readingSessionId: query.readingSessionId,
    });
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 409)) {
      return { status: 'invalid-filter' };
    }
    throw error;
  }
  const [books, filterBook] = await Promise.all([
    lookUpBooks(
      api,
      page.items.map((note) => note.bookId),
    ),
    query.bookId ? orNullIfMissing(getBook(api, query.bookId)) : Promise.resolve(null),
  ]);
  return {
    status: 'ok',
    notes: page.items.map((note) => ({ note, book: books.get(note.bookId) ?? null })),
    pagination: page.pagination,
    filterBook,
  };
}
