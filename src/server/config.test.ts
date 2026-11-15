// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { BffConfigError, loadBffConfig, loadSessionStoreLocation } from './config';

const KEY = randomBytes(32).toString('base64url');

const local = {
  APP_ORIGIN: 'http://localhost:3100',
  API_BASE_URL: 'http://localhost:3000/api/v1',
  BFF_SESSION_MONGODB_URI: 'mongodb://127.0.0.1:27017/avuneri-bff',
  BFF_SESSION_ENCRYPTION_KEY: KEY,
};

const deployed = {
  APP_ORIGIN: 'https://avuneri.example',
  API_BASE_URL: 'https://api.avuneri.example/api/v1',
  BFF_SESSION_MONGODB_URI:
    'mongodb+srv://bff-user:s3cret-password@cluster0.example.mongodb.net/avuneri-bff?retryWrites=true',
  BFF_SESSION_ENCRYPTION_KEY: KEY,
};

function problemsOf(env: Record<string, string | undefined>): string {
  try {
    loadBffConfig(env);
  } catch (error) {
    expect(error).toBeInstanceOf(BffConfigError);
    return (error as Error).message;
  }
  throw new Error('expected the configuration to be rejected');
}

describe('loadBffConfig', () => {
  it('accepts a loopback development configuration without https', () => {
    const config = loadBffConfig(local);
    expect(config).toMatchObject({
      appOrigin: 'http://localhost:3100',
      isHttps: false,
      apiBaseUrl: 'http://localhost:3000/api/v1',
      sessionStore: { databaseName: 'avuneri-bff' },
    });
    expect(config.sessionMasterKey).toHaveLength(32);
  });

  it('accepts a deployed https configuration', () => {
    expect(loadBffConfig(deployed)).toMatchObject({
      appOrigin: 'https://avuneri.example',
      isHttps: true,
      sessionStore: { databaseName: 'avuneri-bff' },
    });
  });

  it('fails closed when anything is missing, naming every variable', () => {
    const message = problemsOf({});
    for (const variable of [
      'APP_ORIGIN',
      'API_BASE_URL',
      'BFF_SESSION_MONGODB_URI',
      'BFF_SESSION_ENCRYPTION_KEY',
    ]) {
      expect(message).toContain(`${variable}: is required`);
    }
  });

  it.each([
    ['plain http on a public host', 'http://avuneri.example'],
    ['a path', 'https://avuneri.example/app'],
    ['credentials', 'https://user:pw@avuneri.example'],
    ['not a URL', 'avuneri.example'],
  ])('rejects an APP_ORIGIN with %s', (_name, value) => {
    expect(problemsOf({ ...deployed, APP_ORIGIN: value })).toContain('APP_ORIGIN');
  });

  it('rejects local-only URLs behind a deployed https origin', () => {
    expect(problemsOf({ ...deployed, API_BASE_URL: 'http://localhost:3000/api/v1' })).toContain(
      'API_BASE_URL',
    );
    expect(
      problemsOf({ ...deployed, BFF_SESSION_MONGODB_URI: 'mongodb://127.0.0.1:27017/avuneri-bff' }),
    ).toContain('BFF_SESSION_MONGODB_URI');
  });

  it.each([
    ['no database name', 'mongodb://127.0.0.1:27017'],
    ['the admin database', 'mongodb://127.0.0.1:27017/admin'],
    ['the default test database', 'mongodb://127.0.0.1:27017/test'],
    ['another scheme', 'postgres://127.0.0.1/avuneri'],
  ])('rejects a session store URI with %s', (_name, value) => {
    expect(problemsOf({ ...local, BFF_SESSION_MONGODB_URI: value })).toContain(
      'BFF_SESSION_MONGODB_URI',
    );
  });

  it.each([
    ['too short', randomBytes(16).toString('base64url')],
    ['too long', randomBytes(48).toString('base64url')],
    ['not base64url', `${KEY.slice(0, 40)}+/=`],
    ['not random', Buffer.alloc(32, 7).toString('base64url')],
  ])('rejects an encryption key that is %s', (_name, value) => {
    expect(problemsOf({ ...local, BFF_SESSION_ENCRYPTION_KEY: value })).toContain(
      'BFF_SESSION_ENCRYPTION_KEY',
    );
  });

  it('never echoes configured values', () => {
    const message = problemsOf({
      ...deployed,
      API_BASE_URL: 'https://api.avuneri.example/wrong-prefix',
      BFF_SESSION_ENCRYPTION_KEY: 'short-secret-value',
    });
    expect(message).not.toContain('s3cret-password');
    expect(message).not.toContain('short-secret-value');
    expect(message).not.toContain('wrong-prefix');
  });
});

describe('session store transport security', () => {
  const REMOTE = 'bff-user:s3cret-password@db.example.net:27017';

  it.each([
    ['plain mongodb:// to a remote host', `mongodb://${REMOTE}/avuneri-bff`],
    [
      'an SRV URI with tls=false',
      'mongodb+srv://cluster0.example.mongodb.net/avuneri-bff?tls=false',
    ],
    [
      'an SRV URI with ssl=false',
      'mongodb+srv://cluster0.example.mongodb.net/avuneri-bff?ssl=false',
    ],
    ['a contradictory tls setting', `mongodb://${REMOTE}/avuneri-bff?tls=true&tls=false`],
    ['tlsInsecure', `mongodb://${REMOTE}/avuneri-bff?tls=true&tlsInsecure=true`],
    [
      'unchecked certificates',
      'mongodb+srv://cluster0.example.mongodb.net/avuneri-bff?tlsAllowInvalidCertificates=true',
    ],
    [
      'unchecked hostnames',
      'mongodb+srv://cluster0.example.mongodb.net/avuneri-bff?TLSAllowInvalidHostnames=TRUE',
    ],
  ])('refuses %s, for deployed and local origins alike', (_name, uri) => {
    for (const env of [deployed, local]) {
      const message = problemsOf({ ...env, BFF_SESSION_MONGODB_URI: uri });
      expect(message).toContain('BFF_SESSION_MONGODB_URI');
      expect(message).toMatch(/TLS/);
      expect(message).not.toContain('s3cret-password');
      expect(message).not.toContain('db.example.net');
    }
    expect(() => loadSessionStoreLocation({ BFF_SESSION_MONGODB_URI: uri })).toThrow(
      BffConfigError,
    );
  });

  it.each([
    [
      'an SRV URI (TLS by default)',
      'mongodb+srv://u:p@cluster0.example.mongodb.net/avuneri-bff?retryWrites=true',
    ],
    ['an SRV URI with tls=true', 'mongodb+srv://cluster0.example.mongodb.net/avuneri-bff?tls=true'],
    ['mongodb:// with tls=true', `mongodb://${REMOTE}/avuneri-bff?tls=true`],
    ['mongodb:// with ssl=TRUE', `mongodb://${REMOTE}/avuneri-bff?ssl=TRUE&replicaSet=rs0`],
    [
      'certificate checks explicitly kept',
      `mongodb://${REMOTE}/avuneri-bff?tls=true&tlsAllowInvalidCertificates=false`,
    ],
  ])('accepts %s and requires TLS for it', (_name, uri) => {
    expect(loadBffConfig({ ...deployed, BFF_SESSION_MONGODB_URI: uri }).sessionStore).toMatchObject(
      {
        databaseName: 'avuneri-bff',
        requiresTls: true,
      },
    );
  });

  it('requires TLS when any listed host is remote', () => {
    const mixed = 'mongodb://127.0.0.1:27017,db.example.net:27017/avuneri-bff';
    expect(problemsOf({ ...local, BFF_SESSION_MONGODB_URI: mixed })).toMatch(/TLS/);
    expect(problemsOf({ ...deployed, BFF_SESSION_MONGODB_URI: mixed })).toContain(
      'BFF_SESSION_MONGODB_URI',
    );
  });

  it('keeps the plaintext exception for a loopback development database only', () => {
    expect(loadBffConfig(local).sessionStore.requiresTls).toBe(false);
    expect(
      loadSessionStoreLocation({ BFF_SESSION_MONGODB_URI: local.BFF_SESSION_MONGODB_URI }),
    ).toMatchObject({
      requiresTls: false,
    });
  });
});
