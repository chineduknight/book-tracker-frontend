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

  it('fails fast on the request path, and waits patiently for the operator index tool', async () => {
    const location = {
      uri: 'mongodb://db.example.net:27017/avuneri-bff',
      databaseName: 'avuneri-bff',
      requiresTls: true,
    };
    const requests = createSessionStoreClient(location, 'test');
    expect(requests.options.waitQueueTimeoutMS).toBe(2_000);
    expect(requests.options.socketTimeoutMS).toBe(4_000);
    const operator = createSessionStoreClient(location, 'test', 'operator');
    expect(operator.options.waitQueueTimeoutMS).toBe(30_000);
    expect(operator.options.connectTimeoutMS).toBe(30_000);
    expect(operator.options.socketTimeoutMS).toBe(120_000);
    expect(operator.options.tls).toBe(true);
    await Promise.all([requests.close(), operator.close()]);
  });
});
