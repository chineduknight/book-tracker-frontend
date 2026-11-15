import { expect, test } from '@playwright/test';
import { navLabels, pages } from './routes';

/**
 * The placeholder shell must not call the Book Tracker API or any third party: every request the
 * browser makes while using the app stays on the app's own origin.
 */
test('the app makes no cross-origin or API requests', async ({ page, baseURL }) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));

  for (const { path } of pages) await page.goto(path);
  await page.goto('/');
  for (const label of navLabels) {
    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: label })
      .click();
  }

  const origin = new URL(baseURL!).origin;
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.filter((url) => new URL(url).origin !== origin)).toEqual([]);
  expect(requests.filter((url) => new URL(url).pathname.startsWith('/api/'))).toEqual([]);
});

test('responses carry the baseline security headers', async ({ request }) => {
  const response = await request.get('/');
  const headers = response.headers();
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['x-powered-by']).toBeUndefined();
});
