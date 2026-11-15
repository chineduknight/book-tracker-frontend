import { expect, test, type Page } from '@playwright/test';
import { navLabels, pages } from './routes';
import {
  APP_ORIGIN,
  backendStats,
  FAKE_API,
  PASSWORD,
  registerViaApi,
  uniqueEmail,
} from './support/session';

/** Collects CSP violations reported in the page, from the very first script. */
async function watchCspViolations(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { cspViolations: string[] }).cspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      (window as unknown as { cspViolations: string[] }).cspViolations.push(
        `${event.violatedDirective} ${event.blockedURI}`,
      );
    });
  });
  return () =>
    page.evaluate(() => (window as unknown as { cspViolations: string[] }).cspViolations);
}

test('the browser talks only to this app, never to the API', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));

  await page.goto('/register');
  await page.getByLabel('Name').fill('Ada Lovelace');
  await page.getByLabel('Email').fill(uniqueEmail());
  await page.getByLabel(/^Password/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL('/');
  for (const label of navLabels) {
    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: label })
      .click();
  }
  await page.getByRole('button', { name: /^Account:/ }).click();
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL('/login?signedOut=1');

  expect(requests.length).toBeGreaterThan(0);
  expect(requests.filter((url) => new URL(url).origin !== APP_ORIGIN)).toEqual([]);
  expect(requests.filter((url) => new URL(url).pathname.startsWith('/api/v1'))).toEqual([]);
});

test('backend tokens never reach the browser', async ({ page, request }) => {
  const bodies: string[] = [];
  page.on('response', async (response) => {
    if (new URL(response.url()).origin !== APP_ORIGIN) return;
    try {
      bodies.push(await response.text());
    } catch {
      // Redirects and aborted navigations have no body.
    }
  });

  const email = uniqueEmail('+fastrefresh');
  await page.goto('/register');
  await page.getByLabel('Name').fill('Ada Lovelace');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel(/^Password/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL('/');
  await page.waitForTimeout(2_100);
  for (const { path } of pages.slice(0, 4)) await page.goto(path);
  await page.request
    .get('/api/session/me')
    .then(async (response) => bodies.push(await response.text()));

  const { tokens } = await backendStats(request, email);
  expect(tokens.length).toBeGreaterThan(2);

  const cookies = await page.context().cookies();
  const session = cookies.find((cookie) => cookie.name === 'avuneri_session_local');
  expect(session).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
  const browserVisible = await page.evaluate(() =>
    JSON.stringify({
      cookie: document.cookie,
      local: { ...localStorage },
      session: { ...sessionStorage },
      html: document.documentElement.outerHTML,
    }),
  );
  expect(browserVisible).not.toContain('avuneri_session');

  const exposed = [...bodies, browserVisible, JSON.stringify(cookies)].join('\n');
  for (const backendToken of tokens) expect(exposed).not.toContain(backendToken);
});

test.describe('CSRF', () => {
  test('a cross-site form post cannot sign a reader out', async ({ page }) => {
    const { name } = await registerViaApi(page);
    await page.goto(
      `${FAKE_API}/__test/csrf-form?target=${encodeURIComponent(`${APP_ORIGIN}/api/session/logout`)}`,
    );
    await page.waitForLoadState('networkidle');
    await page.goto('/');
    await expect(page.getByRole('button', { name: `Account: ${name}` })).toBeVisible();
  });

  for (const origin of ['https://evil.example', 'null']) {
    test(`session requests from origin ${origin} are refused`, async ({ page }) => {
      const { email } = await registerViaApi(page);
      for (const path of ['/api/session/login', '/api/session/register', '/api/session/logout']) {
        const response = await page.request.post(path, {
          data: { email, password: PASSWORD, name: 'Mallory' },
          headers: { Origin: origin, 'X-Forwarded-Host': 'evil.example' },
        });
        expect(response.status()).toBe(403);
      }
      await page.goto('/');
      await expect(page).toHaveURL('/');
    });
  }

  test('a session request without an Origin header is refused', async ({ playwright, baseURL }) => {
    const bare = await playwright.request.newContext({ baseURL: baseURL! });
    const response = await bare.post('/api/session/login', {
      data: { email: uniqueEmail(), password: PASSWORD },
    });
    expect(response.status()).toBe(403);
    await bare.dispose();
  });
});

test('pages and session responses are never cacheable', async ({ page }) => {
  await registerViaApi(page);
  for (const path of ['/', '/library', '/login']) {
    const response = await page.request.get(path, { maxRedirects: 0 });
    expect(response.headers()['cache-control']).toMatch(/no-store/);
  }
  const me = await page.request.get('/api/session/me');
  expect(me.headers()['cache-control']).toBe('no-store');
  await expect(me.json()).resolves.toEqual({
    data: { user: { name: 'Ada Lovelace', email: expect.any(String) } },
  });
});

test('security headers and an enforced CSP apply without breaking the app', async ({ page }) => {
  const violations = await watchCspViolations(page);
  const response = await page.goto('/login');
  const headers = response!.headers();
  const csp = headers['content-security-policy'] ?? '';
  expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(csp).not.toContain('unsafe-eval');
  expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
  for (const directive of [
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "connect-src 'self'",
  ]) {
    expect(csp).toContain(directive);
  }
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['x-powered-by']).toBeUndefined();

  // Hydration works under the policy: the client-side form validation runs.
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByLabel('Email')).toBeFocused();
  await registerViaApi(page);
  await page.goto('/');
  await page.getByRole('button', { name: /^Account:/ }).click();
  await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
  expect(await violations()).toEqual([]);
});

test('each response gets a fresh nonce', async ({ request }) => {
  const nonceOf = async () =>
    /'nonce-([^']+)'/.exec(
      (await request.get('/login')).headers()['content-security-policy'] ?? '',
    )?.[1];
  const [first, second] = [await nonceOf(), await nonceOf()];
  expect(first).toBeTruthy();
  expect(first).not.toBe(second);
});
