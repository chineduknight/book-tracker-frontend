import { describe, expect, it } from 'vitest';
import { loginPathFor, safeReturnPath, withReturnPath } from './safe-redirect';

describe('safeReturnPath', () => {
  it.each(['/', '/library', '/library/wishlist', '/reading', '/notes', '/lending'])(
    'accepts the application path %s',
    (path) => {
      expect(safeReturnPath(path)).toBe(path);
    },
  );

  it.each([
    ['an absolute URL', 'https://evil.example/library'],
    ['a protocol-relative URL', '//evil.example'],
    ['a backslash host', '/\\evil.example'],
    ['an encoded slash', '/%2F%2Fevil.example'],
    ['an encoded path', '/%6C%69brary'],
    ['traversal', '/library/../../evil'],
    ['a query string', '/library?x=https://evil.example'],
    ['a fragment', '/library#x'],
    ['a trailing slash', '/library/'],
    ['an unknown page', '/admin'],
    ['a javascript URL', 'javascript:alert(1)'],
    ['whitespace', ' /library'],
    ['an empty string', ''],
    ['a non-string', ['/library']],
    ['nothing', undefined],
  ])('rejects %s', (_name, candidate) => {
    expect(safeReturnPath(candidate)).toBe('/');
  });
});

describe('loginPathFor', () => {
  it('carries a known destination, encoded', () => {
    expect(loginPathFor('/library/wishlist')).toBe('/login?next=%2Flibrary%2Fwishlist');
  });

  it('omits Home and anything unsafe', () => {
    expect(loginPathFor('/')).toBe('/login');
    expect(loginPathFor('//evil.example')).toBe('/login');
  });

  it('builds links between the sign-in pages', () => {
    expect(withReturnPath('/register', '/notes')).toBe('/register?next=%2Fnotes');
    expect(withReturnPath('/login', 'https://evil.example')).toBe('/login');
  });
});
