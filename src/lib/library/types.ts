import type { BookFormat, CopyCondition, WishlistPriority } from './rules';

/** API DTOs as the BFF passes them to pages and components. Ids are 24-character hex strings. */
export interface Book {
  id: string;
  title: string;
  authors: string[];
  format: BookFormat;
  isbn?: string | undefined;
  edition?: string | undefined;
  description?: string | undefined;
  coverUrl?: string | undefined;
  pageCount?: number | undefined;
  chapterCount?: number | undefined;
  publicationYear?: number | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface DuplicateSuggestion {
  book: Book;
  matchedOn: Array<'title' | 'isbn'>;
}

export interface PhysicalCopy {
  id: string;
  bookId: string;
  /** null when the copy is not assigned to a location. */
  locationId: string | null;
  label?: string | undefined;
  /** Omitted when the condition has not been assessed. */
  condition?: CopyCondition | undefined;
  storageNote?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface StorageLocation {
  id: string;
  name: string;
  description?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

/** A category or a collection: identical shapes, stored separately. */
export interface Group {
  id: string;
  name: string;
  description?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface BookOrganization {
  bookId: string;
  categories: Group[];
  collections: Group[];
}

export interface WishlistItem {
  id: string;
  title: string;
  authors: string[];
  isbn?: string | undefined;
  preferredFormat?: BookFormat | undefined;
  coverUrl?: string | undefined;
  sourceUrl?: string | undefined;
  priority: WishlistPriority;
  note?: string | undefined;
  status: 'wanted' | 'acquired';
  acquiredBookId: string | null;
  acquiredAt?: string | undefined;
  createdAt: string;
  updatedAt: string;
}
