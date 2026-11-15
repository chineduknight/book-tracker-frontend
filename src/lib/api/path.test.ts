// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ApiConfigError } from './errors';
import { apiPath, parseApiBaseUrl } from './path';

describe('apiPath', () => {
  it('builds allowlisted paths', () => {
    expect(apiPath`/books`).toBe('/books');
    expect(apiPath`/auth/me`).toBe('/auth/me');
    expect(apiPath`/reading-sessions`).toBe('/reading-sessions');
  });

  it('encodes each interpolated value as exactly one path segment', () => {
    expect(apiPath`/books/${'a/b?c#d'}`).toBe('/books/a%2Fb%3Fc%23d');
    expect(apiPath`/books/${'665f1c2ab4e5d1a2b3c4d5e6'}/copies`).toBe(
      '/books/665f1c2ab4e5d1a2b3c4d5e6/copies',
    );
    expect(apiPath`/loans/${42}`).toBe('/loans/42');
  });

  it.each([
    ['empty', ''],
    ['dot', '.'],
    ['dot-dot', '..'],
  ])('rejects a %s parameter', (_name, value) => {
    expect(() => apiPath`/books/${value}`).toThrow(ApiConfigError);
  });

  it('rejects resources that are not on the allowlist', () => {
    expect(() => apiPath`/admin`).toThrow(ApiConfigError);
    expect(() => apiPath`/api/v1/books`).toThrow(ApiConfigError);
    expect(() => apiPath`/${'books'}`).toThrow(ApiConfigError);
  });

  it('rejects malformed literals', () => {
    expect(() => apiPath`books`).toThrow(ApiConfigError);
    expect(() => apiPath`/books/`).toThrow(ApiConfigError);
    expect(() => apiPath`//evil.example/books`).toThrow(ApiConfigError);
    expect(() => apiPath`/books?admin=true`).toThrow(ApiConfigError);
    expect(() => apiPath`/books/../auth`).toThrow(ApiConfigError);
    expect(() => apiPath`/api/v1/books`).toThrow(ApiConfigError);
  });
});

describe('parseApiBaseUrl', () => {
  it('normalises a valid URL', () => {
    expect(parseApiBaseUrl('https://api.example.com/api/v1/')).toBe(
      'https://api.example.com/api/v1',
    );
    expect(parseApiBaseUrl('https://example.com/backend/api/v1')).toBe(
      'https://example.com/backend/api/v1',
    );
  });

  it('allows plain http only for a loopback development API', () => {
    expect(parseApiBaseUrl('http://localhost:3000/api/v1')).toBe('http://localhost:3000/api/v1');
    expect(parseApiBaseUrl('http://127.0.0.1:3000/api/v1')).toBe('http://127.0.0.1:3000/api/v1');
    expect(() => parseApiBaseUrl('http://api.example.com/api/v1')).toThrow(/https/);
  });

  it.each([
    ['a relative URL', '/api/v1'],
    ['another scheme', 'ftp://api.example.com/api/v1'],
    ['a missing prefix', 'https://api.example.com'],
    ['a query string', 'https://api.example.com/api/v1?x=1'],
    ['a fragment', 'https://api.example.com/api/v1#x'],
  ])('rejects %s', (_name, value) => {
    expect(() => parseApiBaseUrl(value)).toThrow(ApiConfigError);
  });

  it('rejects embedded credentials without echoing them', () => {
    let error: unknown;
    try {
      parseApiBaseUrl('https://user:s3cret-value@api.example.com/api/v1');
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ApiConfigError);
    expect(String(error)).not.toContain('s3cret-value');
  });
});

describe('apiPath segment boundaries', () => {
  it('rejects a value glued to a literal', () => {
    expect(() => apiPath`/books${'x'}`).toThrow(ApiConfigError);
    expect(() => apiPath`/books/${'x'}copies`).toThrow(ApiConfigError);
    expect(() => apiPath`/books/${'a'}${'b'}`).toThrow(ApiConfigError);
  });
});
