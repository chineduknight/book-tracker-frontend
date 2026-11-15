// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createTokenVault, SealedValueError } from './token-vault';

const vault = createTokenVault(randomBytes(32));

describe('token vault', () => {
  it('round-trips a sealed token without storing it in plaintext', () => {
    const sealed = vault.seal('session-a', 'refresh-token', 'opaque-refresh-token');
    expect(sealed).not.toContain('opaque-refresh-token');
    expect(sealed.startsWith('v1.')).toBe(true);
    expect(vault.open('session-a', 'refresh-token', sealed)).toBe('opaque-refresh-token');
  });

  it('uses a fresh IV for every seal', () => {
    expect(vault.seal('s', 'access-token', 'same')).not.toBe(
      vault.seal('s', 'access-token', 'same'),
    );
  });

  it('refuses a value moved to another session or field', () => {
    const sealed = vault.seal('session-a', 'refresh-token', 'token');
    expect(() => vault.open('session-b', 'refresh-token', sealed)).toThrow(SealedValueError);
    expect(() => vault.open('session-a', 'access-token', sealed)).toThrow(SealedValueError);
  });

  it('refuses tampered or corrupted values', () => {
    const sealed = vault.seal('session-a', 'access-token', 'token');
    const [version, iv, ciphertext, tag] = sealed.split('.');
    const flipped = Buffer.from(ciphertext!, 'base64url');
    flipped[0] = flipped[0]! ^ 1;
    for (const corrupted of [
      [version, iv, flipped.toString('base64url'), tag].join('.'),
      [version, iv, ciphertext].join('.'),
      `v2.${iv}.${ciphertext}.${tag}`,
      'garbage',
      '',
    ]) {
      expect(() => vault.open('session-a', 'access-token', corrupted)).toThrow(SealedValueError);
    }
  });

  it('cannot open values sealed under another key', () => {
    const sealed = createTokenVault(randomBytes(32)).seal('s', 'access-token', 'token');
    expect(() => vault.open('s', 'access-token', sealed)).toThrow(SealedValueError);
  });

  it('derives a keyed verifier that does not reveal the secret', () => {
    const secret = vault.newSessionSecret();
    expect(vault.isWellFormedSessionSecret(secret)).toBe(true);
    expect(vault.verifierDigestOf(secret)).toBe(vault.verifierDigestOf(secret));
    expect(vault.verifierDigestOf(secret)).not.toContain(secret);
    expect(createTokenVault(randomBytes(32)).verifierDigestOf(secret)).not.toBe(
      vault.verifierDigestOf(secret),
    );
  });

  it('generates 256-bit secrets and rejects malformed cookie values', () => {
    const secret = vault.newSessionSecret();
    expect(Buffer.from(secret, 'base64url')).toHaveLength(32);
    for (const candidate of ['', 'short', `${secret}x`, `${secret.slice(0, 42)}=`]) {
      expect(vault.isWellFormedSessionSecret(candidate)).toBe(false);
    }
  });
});
