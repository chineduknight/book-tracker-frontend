// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeFetch, jsonResponse } from '@/test/fixtures/fetch';
import { ApiConfigError } from './errors';
import { apiPath } from './path';
import { createServerApiClient, readApiBaseUrl } from './server';

describe('server API configuration', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requires API_BASE_URL', () => {
    expect(() => readApiBaseUrl({})).toThrow(ApiConfigError);
    expect(() => readApiBaseUrl({ API_BASE_URL: '  ' })).toThrow(ApiConfigError);
  });

  it('creates a client from the server environment', async () => {
    const { fetchImpl, calls } = fakeFetch(jsonResponse(200, { data: { status: 'ok' } }));
    const client = createServerApiClient({
      env: { API_BASE_URL: 'http://localhost:3000/api/v1' },
      fetchImpl,
    });

    await client.get(apiPath`/health`);
    expect(calls()[0]?.url).toBe('http://localhost:3000/api/v1/health');
  });

  it('refuses to run in the browser', () => {
    vi.stubGlobal('window', {});
    expect(() =>
      createServerApiClient({ env: { API_BASE_URL: 'http://localhost:3000/api/v1' } }),
    ).toThrow(ApiConfigError);
  });
});
