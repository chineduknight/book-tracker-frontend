import 'server-only';
import { z } from 'zod';
import {
  BOOK_FORMATS,
  collapseWhitespace,
  containsLetterOrDigit,
  COPY_CONDITIONS,
  LIMITS,
  WISHLIST_PRIORITIES,
} from '@/lib/library/rules';
import type {
  Book,
  BookOrganization,
  DuplicateSuggestion,
  Group,
  PhysicalCopy,
  StorageLocation,
  WishlistItem,
} from '@/lib/library/types';

/*
 * Request schemas mirror book-tracker-backend's Zod schemas exactly (strict objects, the same
 * trimming and collapsing, nullable only where PATCH may clear). The BFF rejects what the API would
 * reject before calling it; the API remains the authority.
 */
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'must be a 24-character hexadecimal id');
const collapsed = (max: number) =>
  z.string().transform(collapseWhitespace).pipe(z.string().min(1).max(max));
const trimmed = (max: number) => z.string().trim().min(1).max(max);
const isbn = z
  .string()
  .trim()
  .max(LIMITS.isbn)
  .refine(containsLetterOrDigit, 'must contain at least one letter or digit');
const httpUrl = z
  .string()
  .trim()
  .max(LIMITS.url)
  .pipe(z.url({ protocol: /^https?$/, error: 'must be an absolute http or https URL' }));
const authors = z.array(trimmed(LIMITS.author)).max(LIMITS.authors);
const format = z.enum(BOOK_FORMATS);
const whole = (max: number) => z.number().int().min(1).max(max);

function atLeastOneChange<Changes extends z.ZodObject>(changes: Changes) {
  return changes.refine((value) => Object.keys(value).length > 0, {
    message: 'must change at least one field',
    when: (payload) => payload.issues.length === 0,
  });
}

export const createBookSchema = z.strictObject({
  title: collapsed(LIMITS.title),
  authors: authors.optional(),
  format,
  isbn: isbn.optional(),
  edition: trimmed(LIMITS.edition).optional(),
  description: trimmed(LIMITS.description).optional(),
  coverUrl: httpUrl.optional(),
  pageCount: whole(LIMITS.pageCount).optional(),
  chapterCount: whole(LIMITS.chapterCount).optional(),
  publicationYear: whole(LIMITS.publicationYear).optional(),
});

export const updateBookSchema = atLeastOneChange(
  z.strictObject({
    title: collapsed(LIMITS.title).optional(),
    authors: authors.optional(),
    format: format.optional(),
    isbn: isbn.nullable().optional(),
    edition: trimmed(LIMITS.edition).nullable().optional(),
    description: trimmed(LIMITS.description).nullable().optional(),
    coverUrl: httpUrl.nullable().optional(),
    pageCount: whole(LIMITS.pageCount).nullable().optional(),
    chapterCount: whole(LIMITS.chapterCount).nullable().optional(),
    publicationYear: whole(LIMITS.publicationYear).nullable().optional(),
  }),
);

export const duplicateCheckSchema = z
  .strictObject({ title: collapsed(LIMITS.title).optional(), isbn: isbn.optional() })
  .refine((query) => query.title !== undefined || query.isbn !== undefined, {
    message: 'provide a title, an isbn or both',
  });

export const createCopySchema = z.strictObject({
  locationId: objectId.nullable().optional(),
  label: trimmed(LIMITS.copyLabel).optional(),
  condition: z.enum(COPY_CONDITIONS).optional(),
  storageNote: trimmed(LIMITS.storageNote).optional(),
});

export const updateCopySchema = atLeastOneChange(
  z.strictObject({
    locationId: objectId.nullable().optional(),
    label: trimmed(LIMITS.copyLabel).nullable().optional(),
    condition: z.enum(COPY_CONDITIONS).nullable().optional(),
    storageNote: trimmed(LIMITS.storageNote).nullable().optional(),
  }),
);

/** Locations, categories and collections share one shape of name and description. */
export const createNamedSchema = z.strictObject({
  name: collapsed(LIMITS.name),
  description: trimmed(LIMITS.groupDescription).optional(),
});

export const updateNamedSchema = atLeastOneChange(
  z.strictObject({
    name: collapsed(LIMITS.name).optional(),
    description: trimmed(LIMITS.groupDescription).nullable().optional(),
  }),
);

export const createWishSchema = z.strictObject({
  title: collapsed(LIMITS.title),
  authors: authors.optional(),
  isbn: isbn.optional(),
  preferredFormat: format.optional(),
  coverUrl: httpUrl.optional(),
  sourceUrl: httpUrl.optional(),
  priority: z.enum(WISHLIST_PRIORITIES).optional(),
  note: trimmed(LIMITS.wishNote).optional(),
});

export const updateWishSchema = atLeastOneChange(
  z.strictObject({
    title: collapsed(LIMITS.title).optional(),
    authors: authors.optional(),
    isbn: isbn.nullable().optional(),
    preferredFormat: format.nullable().optional(),
    coverUrl: httpUrl.nullable().optional(),
    sourceUrl: httpUrl.nullable().optional(),
    priority: z.enum(WISHLIST_PRIORITIES).optional(),
    note: trimmed(LIMITS.wishNote).nullable().optional(),
  }),
);

export const acquisitionSchema = z.strictObject({ bookId: objectId });

/* Response DTOs, checked before anything reaches a page or the browser. */
const isoTimestamp = z.string().min(1);
const id = z.string().regex(/^[0-9a-f]{24}$/);
const optionalText = z.string().optional();

export const bookSchema: z.ZodType<Book> = z.object({
  id,
  title: z.string(),
  authors: z.array(z.string()),
  format,
  isbn: optionalText,
  edition: optionalText,
  description: optionalText,
  coverUrl: optionalText,
  pageCount: z.number().int().optional(),
  chapterCount: z.number().int().optional(),
  publicationYear: z.number().int().optional(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
});

export const duplicateMatchesSchema: z.ZodType<{ matches: DuplicateSuggestion[] }> = z.object({
  matches: z.array(z.object({ book: bookSchema, matchedOn: z.array(z.enum(['title', 'isbn'])) })),
});

export const copySchema: z.ZodType<PhysicalCopy> = z.object({
  id,
  bookId: id,
  locationId: id.nullable(),
  label: optionalText,
  condition: z.enum(COPY_CONDITIONS).optional(),
  storageNote: optionalText,
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
});

export const namedSchema: z.ZodType<Group & StorageLocation> = z.object({
  id,
  name: z.string(),
  description: optionalText,
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
});

export const organizationSchema: z.ZodType<BookOrganization> = z.object({
  bookId: id,
  categories: z.array(namedSchema),
  collections: z.array(namedSchema),
});

export const presetsSchema = z.object({ names: z.array(z.string()) });

export const wishSchema: z.ZodType<WishlistItem> = z.object({
  id,
  title: z.string(),
  authors: z.array(z.string()),
  isbn: optionalText,
  preferredFormat: format.optional(),
  coverUrl: optionalText,
  sourceUrl: optionalText,
  priority: z.enum(WISHLIST_PRIORITIES),
  note: optionalText,
  status: z.enum(['wanted', 'acquired']),
  acquiredBookId: id.nullable(),
  acquiredAt: optionalText,
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
});

export type CreateBook = z.output<typeof createBookSchema>;
export type UpdateBook = z.output<typeof updateBookSchema>;
export type CreateCopy = z.output<typeof createCopySchema>;
export type UpdateCopy = z.output<typeof updateCopySchema>;
export type CreateNamed = z.output<typeof createNamedSchema>;
export type UpdateNamed = z.output<typeof updateNamedSchema>;
export type CreateWish = z.output<typeof createWishSchema>;
export type UpdateWish = z.output<typeof updateWishSchema>;
