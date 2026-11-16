import { describe, expect, it } from 'vitest';
import {
  bookChanges,
  bookFormValuesOf,
  EMPTY_BOOK_FORM,
  newBookPayload,
  validateBookForm,
} from './book-form';
import { copyChanges, copyFormValuesOf, EMPTY_COPY_FORM, newCopyPayload } from './copy-form';
import { hasErrors } from './form-values';
import { namedChanges, newNamedPayload, validateNamedForm } from './named-form';
import type { Book, PhysicalCopy, WishlistItem } from './types';
import { EMPTY_WISH_FORM, newWishPayload, wishChanges, wishFormValuesOf } from './wish-form';

const NOW = '2026-11-15T10:00:00.000Z';
const LOCATION = '665f1c2ab4e5d1a2b3c4d5e1';

const book: Book = {
  id: '665f1c2ab4e5d1a2b3c4d5e6',
  title: 'Middlemarch',
  authors: ['George Eliot'],
  format: 'physical',
  isbn: '9780141439549',
  pageCount: 880,
  createdAt: NOW,
  updatedAt: NOW,
};

describe('book form', () => {
  it('omits blank optional fields on create, never sending empty strings', () => {
    expect(
      newBookPayload({
        ...EMPTY_BOOK_FORM,
        title: '  The   Waves ',
        edition: '   ',
        authors: '\n\n',
      }),
    ).toEqual({ title: 'The Waves', format: 'physical' });
  });

  it('builds a full create payload with numbers and one author per line', () => {
    expect(
      newBookPayload({
        ...EMPTY_BOOK_FORM,
        title: 'Dune',
        authors: ' Frank Herbert \n\n Brian Herbert',
        format: 'ebook',
        pageCount: '412',
        publicationYear: '1965',
        coverUrl: 'https://example.com/dune.jpg',
      }),
    ).toEqual({
      title: 'Dune',
      authors: ['Frank Herbert', 'Brian Herbert'],
      format: 'ebook',
      pageCount: 412,
      publicationYear: 1965,
      coverUrl: 'https://example.com/dune.jpg',
    });
  });

  it('sends no change when nothing changed', () => {
    expect(bookChanges(book, bookFormValuesOf(book))).toEqual({});
    expect(bookChanges(book, { ...bookFormValuesOf(book), title: ' Middlemarch  ' })).toEqual({});
  });

  it('sends only changed fields, null to clear and [] to clear authors', () => {
    expect(
      bookChanges(book, {
        ...bookFormValuesOf(book),
        isbn: '',
        pageCount: '',
        authors: '',
        edition: 'Penguin Classics',
      }),
    ).toEqual({ isbn: null, pageCount: null, authors: [], edition: 'Penguin Classics' });
  });

  it('includes a format change only when asked for', () => {
    expect(bookChanges(book, { ...bookFormValuesOf(book), format: 'ebook' })).toEqual({
      format: 'ebook',
    });
  });

  it('validates with the API limits', () => {
    const errors = validateBookForm({
      ...EMPTY_BOOK_FORM,
      title: ' ',
      pageCount: '12.5',
      publicationYear: '0',
      coverUrl: 'javascript:alert(1)',
      isbn: '---',
      authors: Array.from({ length: 21 }, (_, i) => `Author ${i}`).join('\n'),
    });
    expect(errors.title).toBe('Enter a title.');
    expect(errors.pageCount).toMatch(/whole number/);
    expect(errors.publicationYear).toMatch(/1 to 9,999/);
    expect(errors.coverUrl).toMatch(/https/);
    expect(errors.isbn).toMatch(/letter or digit/);
    expect(errors.authors).toMatch(/20/);
    expect(hasErrors(validateBookForm({ ...EMPTY_BOOK_FORM, title: 'Ok' }))).toBe(false);
  });
});

describe('copy form', () => {
  const copy: PhysicalCopy = {
    id: '665f1c2ab4e5d1a2b3c4d5e2',
    bookId: book.id,
    locationId: LOCATION,
    label: 'Signed',
    condition: 'good',
    createdAt: NOW,
    updatedAt: NOW,
  };

  it('creates an unassigned, unlabelled copy from an empty form', () => {
    expect(newCopyPayload(EMPTY_COPY_FORM)).toEqual({});
    expect(
      newCopyPayload({ ...EMPTY_COPY_FORM, locationId: LOCATION, condition: 'like_new' }),
    ).toEqual({
      locationId: LOCATION,
      condition: 'like_new',
    });
  });

  it('unassigns with locationId: null and clears with null', () => {
    expect(
      copyChanges(copy, { ...copyFormValuesOf(copy), locationId: '', condition: '', label: '' }),
    ).toEqual({ locationId: null, condition: null, label: null });
    expect(copyChanges(copy, copyFormValuesOf(copy))).toEqual({});
  });
});

describe('named form (locations, categories, collections)', () => {
  it('collapses the name and omits a blank description', () => {
    expect(newNamedPayload({ name: '  Study   Shelf ', description: ' ' })).toEqual({
      name: 'Study Shelf',
    });
  });

  it('clears a description with null and reports only changes', () => {
    const location = { name: 'Home', description: 'Living room' };
    expect(namedChanges(location, { name: 'Home', description: '' })).toEqual({
      description: null,
    });
    expect(namedChanges(location, { name: 'home', description: 'Living room' })).toEqual({
      name: 'home',
    });
  });

  it('requires a name', () => {
    expect(validateNamedForm({ name: '', description: '' }).name).toBe('Enter a name.');
  });
});

describe('wish form', () => {
  const wish: WishlistItem = {
    id: '665f1c2ab4e5d1a2b3c4d5e3',
    title: 'Dune',
    authors: [],
    priority: 'medium',
    preferredFormat: 'physical',
    sourceUrl: 'https://example.com/dune',
    status: 'wanted',
    acquiredBookId: null,
    createdAt: NOW,
    updatedAt: NOW,
  };

  it('needs only a title, defaulting to medium priority', () => {
    expect(newWishPayload({ ...EMPTY_WISH_FORM, title: 'Dune' })).toEqual({
      title: 'Dune',
      priority: 'medium',
    });
  });

  it('clears the preference and links with null, without touching status', () => {
    const changes = wishChanges(wish, {
      ...wishFormValuesOf(wish),
      preferredFormat: '',
      sourceUrl: '',
      priority: 'high',
    });
    expect(changes).toEqual({ preferredFormat: null, sourceUrl: null, priority: 'high' });
    expect(changes).not.toHaveProperty('status');
  });
});
