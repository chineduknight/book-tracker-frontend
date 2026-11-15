import {
  authorsProblem,
  isbnProblem,
  optionalText,
  optionalWholeNumber,
  parseAuthors,
  requiredTitleProblem,
  sameAuthors,
  textLengthProblem,
  urlProblem,
  wholeNumberProblem,
  type FieldErrors,
} from './form-values';
import { collapseWhitespace, LIMITS, type BookFormat } from './rules';
import type { Book } from './types';

export interface BookFormValues {
  title: string;
  /** One author per line. */
  authors: string;
  format: BookFormat;
  isbn: string;
  edition: string;
  description: string;
  coverUrl: string;
  pageCount: string;
  chapterCount: string;
  publicationYear: string;
}

export type BookField = keyof BookFormValues;

export const EMPTY_BOOK_FORM: BookFormValues = {
  title: '',
  authors: '',
  format: 'physical',
  isbn: '',
  edition: '',
  description: '',
  coverUrl: '',
  pageCount: '',
  chapterCount: '',
  publicationYear: '',
};

const OPTIONAL_TEXT = ['isbn', 'edition', 'description', 'coverUrl'] as const;
const OPTIONAL_NUMBERS = ['pageCount', 'chapterCount', 'publicationYear'] as const;

export function bookFormValuesOf(book: Book): BookFormValues {
  return {
    title: book.title,
    authors: book.authors.join('\n'),
    format: book.format,
    isbn: book.isbn ?? '',
    edition: book.edition ?? '',
    description: book.description ?? '',
    coverUrl: book.coverUrl ?? '',
    pageCount: book.pageCount?.toString() ?? '',
    chapterCount: book.chapterCount?.toString() ?? '',
    publicationYear: book.publicationYear?.toString() ?? '',
  };
}

export function validateBookForm(values: BookFormValues): FieldErrors<BookField> {
  return {
    title: requiredTitleProblem(values.title),
    authors: authorsProblem(values.authors),
    isbn: isbnProblem(values.isbn),
    edition: textLengthProblem(values.edition, LIMITS.edition),
    description: textLengthProblem(values.description, LIMITS.description),
    coverUrl: urlProblem(values.coverUrl),
    pageCount: wholeNumberProblem(values.pageCount, LIMITS.pageCount),
    chapterCount: wholeNumberProblem(values.chapterCount, LIMITS.chapterCount),
    publicationYear: wholeNumberProblem(values.publicationYear, LIMITS.publicationYear),
  };
}

export type NewBookPayload = Record<string, string | number | string[]>;
export type BookChanges = Record<string, string | number | string[] | null>;

/** For POST: blank optional fields are left out entirely. Assumes the values validated. */
export function newBookPayload(values: BookFormValues): NewBookPayload {
  const payload: NewBookPayload = {
    title: collapseWhitespace(values.title),
    format: values.format,
  };
  const authors = parseAuthors(values.authors);
  if (authors.length > 0) payload.authors = authors;
  for (const field of OPTIONAL_TEXT) {
    const text = optionalText(values[field]);
    if (text !== undefined) payload[field] = text;
  }
  for (const field of OPTIONAL_NUMBERS) {
    const number = optionalWholeNumber(values[field]);
    if (number !== undefined) payload[field] = number;
  }
  return payload;
}

/**
 * For PATCH: only fields that differ from the saved book. A cleared optional field becomes null and
 * cleared authors become []; an empty result means there is nothing to save.
 */
export function bookChanges(book: Book, values: BookFormValues): BookChanges {
  const changes: BookChanges = {};
  const title = collapseWhitespace(values.title);
  if (title !== book.title) changes.title = title;
  if (values.format !== book.format) changes.format = values.format;
  const authors = parseAuthors(values.authors);
  if (!sameAuthors(authors, book.authors)) changes.authors = authors;
  for (const field of OPTIONAL_TEXT) {
    const text = optionalText(values[field]);
    if (text !== book[field]) changes[field] = text ?? null;
  }
  for (const field of OPTIONAL_NUMBERS) {
    const number = optionalWholeNumber(values[field]);
    if (number !== book[field]) changes[field] = number ?? null;
  }
  return changes;
}
