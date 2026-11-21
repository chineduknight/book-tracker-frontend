import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy } from './content-security-policy';

const directive = (policy: string, name: string) =>
  policy.split('; ').find((part) => part.startsWith(`${name} `));

describe('contentSecurityPolicy', () => {
  it('allows https images (book covers) but never plain http or any other scheme', () => {
    const policy = contentSecurityPolicy({ nonce: 'abc', isDevelopment: false, isHttps: true });
    expect(directive(policy, 'img-src')).toBe("img-src 'self' data: https:");
    expect(policy).not.toMatch(/img-src[^;]*\bhttp:/);
    expect(policy).not.toMatch(/img-src[^;]*\*/);
  });

  it('keeps scripts to this origin and the request nonce, without unsafe allowances', () => {
    const policy = contentSecurityPolicy({ nonce: 'abc', isDevelopment: false, isHttps: true });
    expect(directive(policy, 'script-src')).toBe("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(directive(policy, 'connect-src')).toBe("connect-src 'self'");
    expect(policy).toContain('upgrade-insecure-requests');
  });
});
