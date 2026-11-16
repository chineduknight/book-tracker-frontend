import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test';

export const READER_PASSWORD = 'correct horse battery staple';

export interface ReaderAccount {
  name: string;
  email: string;
}

/**
 * The real API allows 20 registrations per hour per address, so each worker registers one reader
 * and every test starts signed in with that reader's saved session. Tests that need an empty
 * library use `registerFreshReader` sparingly.
 */
export const test = base.extend<object, { reader: ReaderAccount; readerState: string }>({
  reader: [
    async ({}, provide, workerInfo) => {
      // Stable for this run, project and parallel slot: a worker replaced after a failure signs in
      // to the same account instead of spending another registration.
      const runId = process.env.E2E_RUN_ID ?? 'local';
      await provide({
        name: 'Ada Lovelace',
        email: `e2e-${runId}-${workerInfo.project.name}-${workerInfo.parallelIndex}@example.test`,
      });
    },
    { scope: 'worker' },
  ],
  readerState: [
    async ({ browser, reader }, provide, workerInfo) => {
      const origin = String(workerInfo.project.use.baseURL);
      const context = await browser.newContext({ baseURL: origin });
      const login = await context.request.post('/api/session/login', {
        data: { email: reader.email, password: READER_PASSWORD },
        headers: { Origin: origin },
      });
      if (login.status() === 401) {
        const registration = await context.request.post('/api/session/register', {
          data: { ...reader, password: READER_PASSWORD },
          headers: { Origin: origin },
        });
        expect(registration.status(), 'registration (the real API allows 20 per hour)').toBe(201);
      } else {
        expect(login.status()).toBe(200);
      }
      mkdirSync('test-results/.auth', { recursive: true });
      const path = `test-results/.auth/${workerInfo.project.name}-${workerInfo.parallelIndex}.json`;
      await context.storageState({ path });
      await context.close();
      await provide(path);
    },
    { scope: 'worker' },
  ],
  storageState: ({ readerState }, provide) => provide(readerState),
});

export { expect };

export async function registerReader(
  request: APIRequestContext,
  origin: string,
): Promise<ReaderAccount> {
  const account = {
    name: 'Ada Lovelace',
    email: `reader-${randomUUID().slice(0, 12)}@example.test`,
  };
  const response = await request.post('/api/session/register', {
    data: { ...account, password: READER_PASSWORD },
    headers: { Origin: origin },
  });
  expect(response.status(), 'registration (the real API allows 20 per hour)').toBe(201);
  return account;
}

/** Signs the page's context in as a brand-new reader with an empty library. */
export async function registerFreshReader(page: Page, origin: string): Promise<ReaderAccount> {
  await page.context().clearCookies();
  return registerReader(page.request, origin);
}

/** Calls this app's library BFF from the page's session (same-origin, CSRF header included). */
export async function libraryApi<T>(
  page: Page,
  origin: string,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  data?: unknown,
): Promise<T> {
  const response = await page.request.fetch(path, {
    method,
    headers: { Origin: origin },
    ...(data === undefined ? {} : { data }),
  });
  expect(response.ok(), `${method} ${path} → ${response.status()}`).toBe(true);
  return response.status() === 204 ? (undefined as T) : (await response.json()).data;
}

/** A word unique to this test, for whole-word searches that ignore other tests' books. */
export function uniqueWord(prefix: string): string {
  return `${prefix}${randomUUID().replace(/-/g, '').slice(0, 10)}`;
}
