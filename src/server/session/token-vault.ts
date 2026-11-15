import 'server-only';
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';

const CIPHER = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const SESSION_SECRET_BYTES = 32;
const SESSION_ID_BYTES = 16;
const FORMAT_VERSION = 'v1';
const SESSION_SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type SealedField = 'access-token' | 'refresh-token';

export class SealedValueError extends Error {
  override readonly name = 'SealedValueError';

  constructor() {
    super('A sealed session value could not be opened');
  }
}

/**
 * Seals backend tokens for storage and derives session verifiers. One master key is expanded with
 * HKDF into independent keys, so the verifier key cannot decrypt tokens and vice versa.
 *
 * Each ciphertext is bound to its session id and field through AES-GCM associated data: a value
 * copied into another session or field fails authentication instead of being used.
 */
export function createTokenVault(masterKey: Buffer) {
  const encryptionKey = deriveKey(masterKey, 'avuneri/bff-session/token-encryption/v1');
  const verifierKey = deriveKey(masterKey, 'avuneri/bff-session/verifier/v1');

  return {
    newSessionId(): string {
      return randomBytes(SESSION_ID_BYTES).toString('base64url');
    },

    /** The browser cookie value: 256 random bits that are never stored. */
    newSessionSecret(): string {
      return randomBytes(SESSION_SECRET_BYTES).toString('base64url');
    },

    isWellFormedSessionSecret(candidate: string): boolean {
      return SESSION_SECRET_PATTERN.test(candidate);
    },

    /** Keyed digest stored in place of the cookie value; a database copy cannot mint cookies. */
    verifierDigestOf(sessionSecret: string): string {
      return createHmac('sha256', verifierKey).update(sessionSecret).digest('base64url');
    },

    seal(sessionId: string, field: SealedField, plaintext: string): string {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv(CIPHER, encryptionKey, iv, { authTagLength: TAG_BYTES });
      cipher.setAAD(associatedData(sessionId, field));
      const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      return [FORMAT_VERSION, iv, ciphertext, cipher.getAuthTag()]
        .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
        .join('.');
    },

    open(sessionId: string, field: SealedField, sealed: string): string {
      const [version, iv, ciphertext, tag, ...rest] = sealed.split('.');
      if (version !== FORMAT_VERSION || !iv || !ciphertext || !tag || rest.length > 0) {
        throw new SealedValueError();
      }
      try {
        const decipher = createDecipheriv(CIPHER, encryptionKey, Buffer.from(iv, 'base64url'), {
          authTagLength: TAG_BYTES,
        });
        decipher.setAAD(associatedData(sessionId, field));
        decipher.setAuthTag(Buffer.from(tag, 'base64url'));
        return Buffer.concat([
          decipher.update(Buffer.from(ciphertext, 'base64url')),
          decipher.final(),
        ]).toString('utf8');
      } catch {
        throw new SealedValueError();
      }
    },
  };
}

export type TokenVault = ReturnType<typeof createTokenVault>;

function deriveKey(masterKey: Buffer, purpose: string): Buffer {
  return Buffer.from(hkdfSync('sha256', masterKey, Buffer.alloc(0), purpose, 32));
}

function associatedData(sessionId: string, field: SealedField): Buffer {
  return Buffer.from(`${FORMAT_VERSION}|${sessionId}|${field}`, 'utf8');
}
