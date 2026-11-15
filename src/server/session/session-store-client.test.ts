// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createSessionStoreClient } from './session-store-client';

describe('createSessionStoreClient', () => {
  it('forces TLS for a remote store even if the URI does not ask for it', async () => {
    const client = createSessionStoreClient(
      {
        uri: 'mongodb://db.example.net:27017/avuneri-bff',
        databaseName: 'avuneri-bff',
        requiresTls: true,
      },
      'test',
    );
    expect(client.options.tls).toBe(true);
    expect(client.options.tlsAllowInvalidCertificates).toBeFalsy();
    expect(client.options.tlsAllowInvalidHostnames).toBeFalsy();
    await client.close();
  });

  it('leaves a loopback development store as configured', async () => {
    const client = createSessionStoreClient(
      {
        uri: 'mongodb://127.0.0.1:27018/avuneri-bff-dev',
        databaseName: 'avuneri-bff-dev',
        requiresTls: false,
      },
      'test',
    );
    expect(client.options.tls).toBeFalsy();
    await client.close();
  });
});
