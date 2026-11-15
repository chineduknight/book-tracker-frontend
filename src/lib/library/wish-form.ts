import {
  authorsProblem,
  isbnProblem,
  optionalText,
  parseAuthors,
  requiredTitleProblem,
  sameAuthors,
  textLengthProblem,
  urlProblem,
  type FieldErrors,
} from './form-values';
import { collapseWhitespace, LIMITS, type BookFormat, type WishlistPriority } from './rules';
import type { WishlistItem } from './types';

export interface WishFormValues {
  title: string;
  authors: string;
  isbn: string;
  /** '' means no preference. */
  preferredFormat: BookFormat | '';
  priority: WishlistPriority;
  coverUrl: string;
  sourceUrl: string;
  note: string;
}

export type WishField = keyof WishFormValues;

export const EMPTY_WISH_FORM: WishFormValues = {
  title: '',
  authors: '',
  isbn: '',
  preferredFormat: '',
  priority: 'medium',
  coverUrl: '',
  sourceUrl: '',
  note: '',
};

const OPTIONAL_TEXT = ['isbn', 'coverUrl', 'sourceUrl', 'note'] as const;

export function wishFormValuesOf(wish: WishlistItem): WishFormValues {
  return {
    title: wish.title,
    authors: wish.authors.join('\n'),
    isbn: wish.isbn ?? '',
    preferredFormat: wish.preferredFormat ?? '',
    priority: wish.priority,
    coverUrl: wish.coverUrl ?? '',
    sourceUrl: wish.sourceUrl ?? '',
    note: wish.note ?? '',
  };
}

export function validateWishForm(values: WishFormValues): FieldErrors<WishField> {
  return {
    title: requiredTitleProblem(values.title),
    authors: authorsProblem(values.authors),
    isbn: isbnProblem(values.isbn),
    coverUrl: urlProblem(values.coverUrl),
    sourceUrl: urlProblem(values.sourceUrl),
    note: textLengthProblem(values.note, LIMITS.wishNote),
  };
}

export function newWishPayload(values: WishFormValues): Record<string, string | string[]> {
  const payload: Record<string, string | string[]> = {
    title: collapseWhitespace(values.title),
    priority: values.priority,
  };
  const authors = parseAuthors(values.authors);
  if (authors.length > 0) payload.authors = authors;
  if (values.preferredFormat !== '') payload.preferredFormat = values.preferredFormat;
  for (const field of OPTIONAL_TEXT) {
    const text = optionalText(values[field]);
    if (text !== undefined) payload[field] = text;
  }
  return payload;
}

export function wishChanges(
  wish: WishlistItem,
  values: WishFormValues,
): Record<string, string | string[] | null> {
  const changes: Record<string, string | string[] | null> = {};
  const title = collapseWhitespace(values.title);
  if (title !== wish.title) changes.title = title;
  const authors = parseAuthors(values.authors);
  if (!sameAuthors(authors, wish.authors)) changes.authors = authors;
  if (values.priority !== wish.priority) changes.priority = values.priority;
  const preferredFormat = values.preferredFormat === '' ? undefined : values.preferredFormat;
  if (preferredFormat !== wish.preferredFormat) changes.preferredFormat = preferredFormat ?? null;
  for (const field of OPTIONAL_TEXT) {
    const text = optionalText(values[field]);
    if (text !== wish[field]) changes[field] = text ?? null;
  }
  return changes;
}
