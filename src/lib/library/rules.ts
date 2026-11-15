/**
 * The library API's field rules and enumerations (book-tracker-backend `*.schema.ts`), shared by
 * forms for immediate feedback and by the BFF's server-side validation. The API stays authoritative.
 */
export const BOOK_FORMATS = ['physical', 'ebook'] as const;
export type BookFormat = (typeof BOOK_FORMATS)[number];
export const FORMAT_LABELS: Record<BookFormat, string> = { physical: 'Physical', ebook: 'Ebook' };

export const BOOK_SORTS = ['recent', 'oldest', 'title_asc', 'title_desc'] as const;
export type BookSort = (typeof BOOK_SORTS)[number];

export const SORT_LABELS = {
  recent: 'Recently added',
  oldest: 'Oldest first',
  title_asc: 'Title A–Z',
  title_desc: 'Title Z–A',
  priority: 'Priority, highest first',
} as const;

export const COPY_CONDITIONS = ['new', 'like_new', 'good', 'fair', 'poor'] as const;
export type CopyCondition = (typeof COPY_CONDITIONS)[number];
export const CONDITION_LABELS: Record<CopyCondition, string> = {
  new: 'New',
  like_new: 'Like new',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
};

export const WISHLIST_PRIORITIES = ['low', 'medium', 'high'] as const;
export type WishlistPriority = (typeof WISHLIST_PRIORITIES)[number];
export const PRIORITY_LABELS: Record<WishlistPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

export const WISHLIST_STATUS_FILTERS = ['wanted', 'acquired', 'all'] as const;
export type WishlistStatusFilter = (typeof WISHLIST_STATUS_FILTERS)[number];
export const WISHLIST_SORTS = ['recent', 'oldest', 'title_asc', 'title_desc', 'priority'] as const;
export type WishlistSort = (typeof WISHLIST_SORTS)[number];

export const GROUP_KINDS = ['categories', 'collections'] as const;
export type GroupKind = (typeof GROUP_KINDS)[number];

export const LIMITS = {
  title: 250,
  author: 120,
  authors: 20,
  isbn: 32,
  edition: 100,
  description: 5_000,
  url: 2_048,
  pageCount: 100_000,
  chapterCount: 10_000,
  publicationYear: 9_999,
  copyLabel: 100,
  storageNote: 500,
  name: 100,
  groupDescription: 500,
  wishNote: 2_000,
  search: 120,
} as const;

/** The API's page size default; the BFF always asks for it explicitly. */
export const PAGE_SIZE = 20;

const OBJECT_ID = /^[0-9a-f]{24}$/i;

export function isObjectId(value: unknown): value is string {
  return typeof value === 'string' && OBJECT_ID.test(value);
}

export function collapseWhitespace(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

export function containsLetterOrDigit(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text);
}

/** True for an absolute http(s) URL; used before rendering any reader-supplied link. */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname.length > 0;
  } catch {
    return false;
  }
}
