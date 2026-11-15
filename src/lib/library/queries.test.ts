import { describe, expect, it } from 'vitest';
import {
  BOOK_QUERY_DEFAULTS,
  hrefWithQuery,
  isFilteredBookQuery,
  parseBookListQuery,
  parsePage,
  parseWishlistQuery,
} from './queries';
import { isHttpUrl, isObjectId } from './rules';

describe('parseBookListQuery', () => {
  it('reads the supported filters', () => {
    expect(
      parseBookListQuery({
        q: '  war   and peace ',
        format: 'ebook',
        sort: 'title_desc',
        page: '3',
      }),
    ).toEqual({ q: 'war and peace', format: 'ebook', sort: 'title_desc', page: 3 });
  });

  it('falls back to defaults for repeated, unknown or invalid values', () => {
    expect(
      parseBookListQuery({ q: ['a', 'b'], format: 'audiobook', sort: 'random', page: '0' }),
    ).toEqual({ q: undefined, format: undefined, sort: 'recent', page: 1 });
    expect(parseBookListQuery({ page: '007' }).page).toBe(1);
    expect(parseBookListQuery({ page: '-2' }).page).toBe(1);
    expect(parseBookListQuery({ q: '!!!' }).q).toBeUndefined();
    expect(parseBookListQuery({ q: 'x'.repeat(121) }).q).toBeUndefined();
  });

  it('knows when a list is filtered', () => {
    expect(isFilteredBookQuery(parseBookListQuery({}))).toBe(false);
    expect(isFilteredBookQuery(parseBookListQuery({ sort: 'oldest', page: '2' }))).toBe(false);
    expect(isFilteredBookQuery(parseBookListQuery({ format: 'physical' }))).toBe(true);
  });

  it('caps absurd pages', () => {
    expect(parsePage({ page: '99999999999' })).toBe(100_000);
  });
});

describe('parseWishlistQuery', () => {
  it('defaults to wanted items, newest first', () => {
    expect(parseWishlistQuery({})).toEqual({
      status: 'wanted',
      priority: undefined,
      q: undefined,
      sort: 'recent',
      page: 1,
    });
  });

  it('accepts every documented filter and order', () => {
    expect(
      parseWishlistQuery({
        status: 'all',
        priority: 'high',
        q: 'Dune',
        sort: 'priority',
        page: '2',
      }),
    ).toEqual({ status: 'all', priority: 'high', q: 'Dune', sort: 'priority', page: 2 });
  });
});

describe('hrefWithQuery', () => {
  it('omits defaults and blanks, and encodes values', () => {
    expect(
      hrefWithQuery(
        '/library',
        { q: 'war & peace', format: undefined, sort: 'recent', page: 1 },
        BOOK_QUERY_DEFAULTS,
      ),
    ).toBe('/library?q=war+%26+peace');
    expect(hrefWithQuery('/library', { sort: 'oldest', page: 2 }, BOOK_QUERY_DEFAULTS)).toBe(
      '/library?sort=oldest&page=2',
    );
  });
});

describe('rules', () => {
  it('recognises API ids', () => {
    expect(isObjectId('665f1c2ab4e5d1a2b3c4d5e6')).toBe(true);
    expect(isObjectId('665F1C2AB4E5D1A2B3C4D5E6')).toBe(true);
    expect(isObjectId('665f1c2ab4e5d1a2b3c4d5e')).toBe(false);
    expect(isObjectId(['665f1c2ab4e5d1a2b3c4d5e6'])).toBe(false);
  });

  it.each([
    ['https://example.com/book', true],
    ['http://example.com', true],
    ['javascript:alert(1)', false],
    ['data:text/html,<script>', false],
    ['//example.com', false],
    ['ftp://example.com', false],
    ['not a url', false],
  ])('treats %s as a safe outbound link: %s', (url, expected) => {
    expect(isHttpUrl(url)).toBe(expected);
  });
});
