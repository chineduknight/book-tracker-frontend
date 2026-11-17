import { expect, test } from '@playwright/test';
import { pages } from './routes';
import {
  backendStats,
  PASSWORD,
  registerViaApi,
  revokeAtBackend,
  uniqueEmail,
} from './support/session';

test.describe('signed out', () => {
  for (const { path } of pages) {
    test(`${path} redirects to sign-in, keeping the destination`, async ({ page }) => {
      await page.goto(path);
      const expected = path === '/' ? '/login' : `/login?next=${encodeURIComponent(path)}`;
      await expect(page).toHaveURL(expected);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sign in');
      await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(0);
    });
  }

  test('sign-in and registration link to each other, keeping the destination', async ({ page }) => {
    await page.goto('/login?next=%2Fnotes');
    await page.getByRole('link', { name: 'Create an account' }).click();
    await expect(page).toHaveURL('/register?next=%2Fnotes');
    await page.getByRole('link', { name: 'Sign in' }).click();
    await expect(page).toHaveURL('/login?next=%2Fnotes');
  });
});

test.describe('registration', () => {
  test('creates an account and opens the signed-in app', { tag: '@critical' }, async ({ page }) => {
    const email = uniqueEmail();
    await page.goto('/register');
    await page.getByLabel('Name').fill('Grace Hopper');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel(/^Password/).fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome back, Grace Hopper');
    await page.getByRole('button', { name: 'Account: Grace Hopper' }).click();
    await expect(page.getByText(email)).toBeVisible();
  });

  test('explains a taken email on the email field', async ({ page }) => {
    const { email } = await registerViaApi(page);
    await page.context().clearCookies();
    await page.goto('/register');
    await page.getByLabel('Name').fill('Someone Else');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel(/^Password/).fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByRole('main').getByRole('alert')).toContainText('already exists');
    await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  test('checks the password policy before sending anything', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));
    await page.goto('/register');
    await page.getByLabel('Name').fill('Ada');
    await page.getByLabel('Email').fill(uniqueEmail());
    await page.getByLabel(/^Password/).fill('too short');
    await page.getByLabel(/^Password/).press('Enter');

    await expect(page.getByLabel(/^Password/)).toBeFocused();
    await expect(page.getByText('Use at least 12 characters.')).toBeVisible();
    expect(requests.filter((url) => url.includes('/api/session/'))).toEqual([]);
  });
});

test.describe('sign in', () => {
  test('returns to the page the reader asked for', { tag: '@critical' }, async ({ page }) => {
    const { email } = await registerViaApi(page);
    await page.context().clearCookies();

    await page.goto('/library/wishlist');
    await expect(page).toHaveURL('/login?next=%2Flibrary%2Fwishlist');
    await page.getByLabel('Email').fill(email.toUpperCase());
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Password', { exact: true }).press('Enter');

    await expect(page).toHaveURL('/library/wishlist');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Wishlist');
  });

  for (const next of [
    'https://evil.example',
    '//evil.example',
    '/%2F%2Fevil.example',
    '/\\evil.example',
    '/library/../../evil',
    'javascript:alert(1)',
  ]) {
    test(`ignores the unsafe destination ${next}`, async ({ page }) => {
      const { email } = await registerViaApi(page);
      await page.context().clearCookies();
      await page.goto(`/login?next=${encodeURIComponent(next)}`);
      await page.getByLabel('Email').fill(email);
      await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(page).toHaveURL('/');
    });
  }

  test('keeps what was typed before the page became interactive', async ({ page }) => {
    const { email } = await registerViaApi(page);
    await page.context().clearCookies();
    let releaseScripts: () => void = () => {};
    const scriptsHeld = new Promise<void>((resolve) => (releaseScripts = resolve));
    await page.route('**/_next/static/chunks/**', async (route) => {
      await scriptsHeld;
      await route.continue();
    });
    await page.goto('/login', { waitUntil: 'commit' });
    await page.locator('input[name="email"]').fill(email);
    releaseScripts();
    await expect(page.locator('form')).toHaveAttribute('aria-busy', 'false');
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL('/');
  });

  test('says when the email or password is wrong', { tag: '@critical' }, async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(uniqueEmail());
    await page.getByLabel('Password', { exact: true }).fill('not the password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      'Email or password is incorrect.',
    );
    await expect(page).toHaveURL('/login');
  });

  test('explains rate limiting with the wait', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(`ratelimited@example.test`);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText('Wait about 2 minutes');
  });

  test('reports an unreachable API as retryable, not as wrong credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('outage@example.test');
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    const alert = page.getByRole('main').getByRole('alert');
    await expect(alert).toContainText('can’t be reached');
    await expect(alert).not.toContainText('incorrect');
  });

  test('sends signed-in readers away from the sign-in pages', async ({ page }) => {
    await registerViaApi(page);
    await page.goto('/login');
    await expect(page).toHaveURL('/');
    await page.goto('/register?next=%2Freading');
    await expect(page).toHaveURL('/reading');
  });
});

test.describe('signing out', () => {
  test(
    'ends the session; back navigation shows no private page',
    { tag: '@critical' },
    async ({ page }) => {
      const { name } = await registerViaApi(page);
      await page.goto('/');
      await page.goto('/library');
      await page.getByRole('button', { name: `Account: ${name}` }).click();
      await page.getByRole('button', { name: 'Log out' }).click();

      await expect(page).toHaveURL('/login?signedOut=1');
      await expect(
        page.getByRole('status').filter({ hasText: 'You have signed out.' }),
      ).toBeVisible();

      await page.goBack();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sign in');
      await expect(page.getByText(name)).toHaveCount(0);
      await page.goto('/library');
      await expect(page).toHaveURL('/login?next=%2Flibrary');
    },
  );

  test('the account menu works from the keyboard', async ({ page }) => {
    const { name } = await registerViaApi(page);
    await page.goto('/');
    const toggle = page.getByRole('button', { name: `Account: ${name}` });
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toBeFocused();
  });
});

test.describe('session lifetime', () => {
  test(
    'a session revoked at the API ends on the next page',
    { tag: '@critical' },
    async ({ page, request }) => {
      const { email } = await registerViaApi(page);
      await page.goto('/notes');
      await revokeAtBackend(request, email);
      await page.goto('/reading');
      await expect(page).toHaveURL('/login?next=%2Freading');
    },
  );

  test('a session ends at its absolute expiry', { tag: '@critical' }, async ({ page }) => {
    test.slow();
    await registerViaApi(page, { email: uniqueEmail('+shortsession') });
    await page.goto('/library');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Library');
    await page.waitForTimeout(9_000);
    await page.goto('/library');
    await expect(page).toHaveURL('/login?next=%2Flibrary');
  });

  test(
    'concurrent tabs refresh one token at a time and stay signed in',
    { tag: '@critical' },
    async ({ page, context, request }) => {
      test.slow();
      const { email, name } = await registerViaApi(page, { email: uniqueEmail('+fastrefresh') });
      const tabs = [page, ...(await Promise.all([1, 2, 3].map(() => context.newPage())))];

      for (let round = 0; round < 3; round += 1) {
        // Each access token lives 2 s, so every round needs a refresh, raced by all four tabs.
        await page.waitForTimeout(2_100);
        await Promise.all(tabs.map((tab, index) => tab.goto(pages[index]!.path)));
        for (const tab of tabs) {
          await expect(tab.getByRole('button', { name: `Account: ${name}` })).toBeVisible();
        }
      }

      const stats = await backendStats(request, email);
      expect(stats.reuseDetected).toBe(0);
      expect(stats.refreshCalls).toBeGreaterThanOrEqual(3);
    },
  );
});
