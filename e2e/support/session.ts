import { randomUUID } from 'node:crypto';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { FAKE_API, FAKE_APP } from './ports';

export { FAKE_API };
/** The fake-API app instance these session tests run against. */
export const APP_ORIGIN = FAKE_APP;
export const PASSWORD = 'correct horse battery staple';

/** A fresh reader per test, so parallel tests never share an account. */
export function uniqueEmail(marker = ''): string {
  return `reader-${randomUUID().slice(0, 12)}${marker}@example.test`;
}

/** Registers through the BFF exactly as the form does, leaving the session cookie in the page's context. */
export async function registerViaApi(page: Page, options: { name?: string; email?: string } = {}) {
  const email = options.email ?? uniqueEmail();
  const name = options.name ?? 'Ada Lovelace';
  const response = await page.request.post('/api/session/register', {
    data: { name, email, password: PASSWORD },
    headers: { Origin: APP_ORIGIN },
  });
  expect(response.status()).toBe(201);
  return { name, email };
}

export async function backendStats(request: APIRequestContext, email: string) {
  const response = await request.get(`${FAKE_API}/__test/stats?email=${encodeURIComponent(email)}`);
  return (await response.json()).data as {
    refreshCalls: number;
    reuseDetected: number;
    tokens: string[];
  };
}

export async function revokeAtBackend(request: APIRequestContext, email: string) {
  await request.post(`${FAKE_API}/__test/revoke`, { data: { email } });
}
