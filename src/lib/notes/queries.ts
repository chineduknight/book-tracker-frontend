import {
  hrefWithQuery,
  parsePage,
  parseSearchText,
  type SearchParams,
} from '@/lib/library/queries';
import { isObjectId } from '@/lib/library/rules';
import { NOTE_KINDS, NOTE_LIMITS, NOTE_SORTS, type NoteKind, type NoteSort } from './rules';

/**
 * Notes filters in the URL: only what the API supports. `q` is the API's whole-word, any-word
 * search; `chapter` is an exact label match. A malformed book or reading id is reported, never
 * silently dropped, so a filtered view can't quietly turn into "all notes".
 */
export interface NotesQuery {
  kind?: NoteKind | undefined;
  q?: string | undefined;
  chapter?: string | undefined;
  bookId?: string | undefined;
  readingSessionId?: string | undefined;
  sort: NoteSort;
  page: number;
  invalidFilter: boolean;
}

export const NOTES_QUERY_DEFAULTS = { sort: 'recent', page: 1 } as const;

function single(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  return typeof value === 'string' ? value : undefined;
}

function idParam(params: SearchParams, key: string): { id?: string; invalid: boolean } {
  const value = params[key];
  if (value === undefined || value === '') return { invalid: false };
  return typeof value === 'string' && isObjectId(value)
    ? { id: value.toLowerCase(), invalid: false }
    : { invalid: true };
}

export function parseChapter(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const text = value.trim();
  return text.length > 0 && text.length <= NOTE_LIMITS.chapter ? text : undefined;
}

export function parseNotesQuery(params: SearchParams): NotesQuery {
  const kind = single(params, 'kind');
  const sort = single(params, 'sort');
  const book = idParam(params, 'bookId');
  const session = idParam(params, 'readingSessionId');
  return {
    kind: NOTE_KINDS.find((candidate) => candidate === kind),
    q: parseSearchText(single(params, 'q')),
    chapter: parseChapter(single(params, 'chapter')),
    bookId: book.id,
    readingSessionId: session.id,
    sort: NOTE_SORTS.find((candidate) => candidate === sort) ?? 'recent',
    page: parsePage(params),
    invalidFilter: book.invalid || session.invalid,
  };
}

export function isFilteredNotesQuery(query: NotesQuery): boolean {
  return (
    query.kind !== undefined ||
    query.q !== undefined ||
    query.chapter !== undefined ||
    query.bookId !== undefined ||
    query.readingSessionId !== undefined
  );
}

export function notesHref(
  query: Omit<NotesQuery, 'invalidFilter' | 'page' | 'sort'> & { sort?: NoteSort; page?: number },
): string {
  return hrefWithQuery(
    '/notes',
    {
      kind: query.kind,
      q: query.q,
      chapter: query.chapter,
      bookId: query.bookId,
      readingSessionId: query.readingSessionId,
      sort: query.sort,
      page: query.page,
    },
    NOTES_QUERY_DEFAULTS,
  );
}
