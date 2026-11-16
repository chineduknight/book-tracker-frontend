import { collapseWhitespace, containsLetterOrDigit, isHttpUrl, LIMITS } from './rules';

export type FieldErrors<Field extends string> = Partial<Record<Field, string | undefined>>;

export function hasErrors(errors: Record<string, string | undefined>): boolean {
  return Object.values(errors).some(Boolean);
}

/** Trimmed text, or undefined when blank: blank optional fields are omitted, never sent as "". */
export function optionalText(value: string): string | undefined {
  const text = value.trim();
  return text.length > 0 ? text : undefined;
}

/** One author per line; blank lines are ignored. */
export function parseAuthors(value: string): string[] {
  return value
    .split('\n')
    .map((author) => author.trim())
    .filter((author) => author.length > 0);
}

export function sameAuthors(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((author, index) => author === b[index]);
}

/** A whole number, undefined when blank, or NaN when the text is not a whole number. */
export function optionalWholeNumber(value: string): number | undefined {
  const text = value.trim();
  if (text === '') return undefined;
  return /^[0-9]+$/.test(text) ? Number(text) : Number.NaN;
}

export function requiredTitleProblem(
  value: string,
  max: number = LIMITS.title,
): string | undefined {
  const title = collapseWhitespace(value);
  if (title.length === 0) return 'Enter a title.';
  if (title.length > max) return `Use at most ${max} characters.`;
  return undefined;
}

export function textLengthProblem(value: string, max: number): string | undefined {
  return value.trim().length > max ? `Use at most ${max} characters.` : undefined;
}

export function authorsProblem(value: string): string | undefined {
  const authors = parseAuthors(value);
  if (authors.length > LIMITS.authors) return `List at most ${LIMITS.authors} authors.`;
  if (authors.some((author) => author.length > LIMITS.author)) {
    return `Each author can be at most ${LIMITS.author} characters.`;
  }
  return undefined;
}

export function isbnProblem(value: string): string | undefined {
  const isbn = value.trim();
  if (isbn === '') return undefined;
  if (isbn.length > LIMITS.isbn) return `Use at most ${LIMITS.isbn} characters.`;
  return containsLetterOrDigit(isbn) ? undefined : 'An ISBN needs at least one letter or digit.';
}

export function urlProblem(value: string): string | undefined {
  const url = value.trim();
  if (url === '') return undefined;
  if (url.length > LIMITS.url) return `Use at most ${LIMITS.url} characters.`;
  return isHttpUrl(url) ? undefined : 'Enter a full web address starting with https:// or http://.';
}

export function wholeNumberProblem(value: string, max: number): string | undefined {
  const number = optionalWholeNumber(value);
  if (number === undefined) return undefined;
  if (Number.isNaN(number) || number < 1 || number > max) {
    return `Enter a whole number from 1 to ${max.toLocaleString('en')}.`;
  }
  return undefined;
}
