import { describe, expect, it } from 'vitest';
import { isDestinationActive, librarySections, primaryNavigation } from './navigation';

describe('primary navigation', () => {
  it('has exactly the five agreed destinations, in order', () => {
    expect(primaryNavigation.map(({ label, href }) => [label, href])).toEqual([
      ['Home', '/'],
      ['Library', '/library'],
      ['Reading', '/reading'],
      ['Notes', '/notes'],
      ['Lending', '/lending'],
    ]);
  });

  it('keeps Categories, Collections, Wishlist and Locations inside Library', () => {
    expect(librarySections.map(({ href }) => href)).toEqual([
      '/library/categories',
      '/library/collections',
      '/library/wishlist',
      '/library/locations',
    ]);
  });

  it('keeps Library active on every deeper library page', () => {
    for (const pathname of [
      '/library/new',
      '/library/books/665f1c2ab4e5d1a2b3c4d5e6',
      '/library/books/665f1c2ab4e5d1a2b3c4d5e6/edit',
      '/library/categories/665f1c2ab4e5d1a2b3c4d5e6',
      '/library/wishlist/new',
      '/library/locations',
    ]) {
      const active = primaryNavigation.filter(({ href }) => isDestinationActive(href, pathname));
      expect(active.map(({ href }) => href)).toEqual(['/library']);
    }
  });

  it.each([
    ['/', '/'],
    ['/reading', '/reading'],
    ['/library', '/library'],
    ['/library/wishlist', '/library'],
    ['/notes/some/deep/path', '/notes'],
  ])('marks only the right destination active for %s', (pathname, expected) => {
    const active = primaryNavigation.filter(({ href }) => isDestinationActive(href, pathname));
    expect(active.map(({ href }) => href)).toEqual([expected]);
  });

  it('does not treat a shared prefix as a subpath', () => {
    expect(isDestinationActive('/library', '/library-old')).toBe(false);
    expect(isDestinationActive('/', '/unknown')).toBe(false);
  });
});
