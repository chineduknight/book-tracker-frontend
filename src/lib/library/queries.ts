import {
  BOOK_FORMATS,
  BOOK_SORTS,
  collapseWhitespace,
  containsLetterOrDigit,
  LIMITS,
  WISHLIST_PRIORITIES,
  WISHLIST_SORTS,
  WISHLIST_STATUS_FILTERS,
  type BookFormat,
  type BookSort,
  type WishlistPriority,
  type WishlistSort,
  type WishlistStatusFilter,
} from './rules';

/**
 * List filters live in the URL so they survive reloads and sharing. These parsers accept only
 * the API's parameters and values: a repeated key, an unknown value or an out-of-range page falls
 * back to its default instead of reaching the API (which would reject it).
 */
export type SearchParams = Readonly<Record<string, string | string[] | undefined>>;

const MAX_PAGE = 100_000;

function single(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  return typeof value === 'string' ? value : undefined;
}

function choice<const Choices extends readonly string[]>(
  value: string | undefined,
  choices: Choices,
): Choices[number] | undefined {
  return choices.find((candidate) => candidate === value);
}

export function parsePage(params: SearchParams): number {
  const value = single(params, 'page') ?? '';
  if (!/^[1-9][0-9]*$/.test(value)) return 1;
  return Math.min(Number(value), MAX_PAGE);
}

export function parseSearchText(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const text = collapseWhitespace(value);
  return text.length > 0 && text.length <= LIMITS.search && containsLetterOrDigit(text)
    ? text
    : undefined;
}

export interface BookListQuery {
  q?: string | undefined;
  format?: BookFormat | undefined;
  sort: BookSort;
  page: number;
}

export function parseBookListQuery(params: SearchParams): BookListQuery {
  return {
    q: parseSearchText(single(params, 'q')),
    format: choice(single(params, 'format'), BOOK_FORMATS),
    sort: choice(single(params, 'sort'), BOOK_SORTS) ?? 'recent',
    page: parsePage(params),
  };
}

export function isFilteredBookQuery(query: BookListQuery): boolean {
  return query.q !== undefined || query.format !== undefined;
}

export interface WishlistQuery {
  status: WishlistStatusFilter;
  priority?: WishlistPriority | undefined;
  q?: string | undefined;
  sort: WishlistSort;
  page: number;
}

export function parseWishlistQuery(params: SearchParams): WishlistQuery {
  return {
    status: choice(single(params, 'status'), WISHLIST_STATUS_FILTERS) ?? 'wanted',
    priority: choice(single(params, 'priority'), WISHLIST_PRIORITIES),
    q: parseSearchText(single(params, 'q')),
    sort: choice(single(params, 'sort'), WISHLIST_SORTS) ?? 'recent',
    page: parsePage(params),
  };
}

/** Builds `path?…` from non-default values only, so URLs stay short and canonical. */
export function hrefWithQuery(
  path: string,
  values: Readonly<Record<string, string | number | undefined>>,
  defaults: Readonly<Record<string, string | number>> = {},
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === '' || value === defaults[key]) continue;
    params.set(key, String(value));
  }
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

export const BOOK_QUERY_DEFAULTS = { sort: 'recent', page: 1 } as const;
export const WISHLIST_QUERY_DEFAULTS = { status: 'wanted', sort: 'recent', page: 1 } as const;
