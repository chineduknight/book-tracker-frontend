import type { NoteKind } from './rules';

/**
 * A private note or highlight. `content` is Markdown source for a note and a plain-text quotation
 * for a highlight; `commentary` is Markdown source. None of it is ever rendered as HTML.
 */
export interface Note {
  id: string;
  bookId: string;
  /** Always present; null for a book-level note. Fixed at creation. */
  readingSessionId: string | null;
  kind: NoteKind;
  content: string;
  title?: string | undefined;
  commentary?: string | undefined;
  chapter?: string | undefined;
  pageNumber?: number | undefined;
  createdAt: string;
  updatedAt: string;
}
