import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { pages, publicPages } from './routes';
import { registerViaApi } from './support/session';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const summary = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    targets: v.nodes.map((n) => n.target.join(' ')),
  }));
  expect(summary).toEqual([]);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} theme`, () => {
    test.use({ colorScheme });

    test.describe('signed in', () => {
      test.beforeEach(async ({ page }) => {
        await registerViaApi(page);
      });

      for (const { path } of pages) {
        test(`${path} has no automated accessibility violations`, async ({ page }) => {
          await page.goto(path);
          await expectNoViolations(page);
        });
      }

      test('the open account menu has no violations', async ({ page }) => {
        await page.goto('/');
        await page.getByRole('button', { name: /^Account:/ }).click();
        await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
        await expectNoViolations(page);
      });
    });

    for (const { path } of [...publicPages, { path: '/no-such-page' }]) {
      test(`${path} has no automated accessibility violations`, async ({ page }) => {
        await page.goto(path);
        await expectNoViolations(page);
      });
    }

    test('sign-in errors have no violations', async ({ page }) => {
      await page.goto('/login');
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');
      await expectNoViolations(page);
    });
  });
}

test.describe('themes', () => {
  test('follows the system light preference', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/login');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(246, 243, 236)');
  });

  test('follows the system dark preference', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/login');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(20, 19, 17)');
    await expect(page.locator('body')).toHaveCSS('color', 'rgb(237, 231, 220)');
  });
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('transitions and animations are effectively disabled', async ({ page }) => {
    await registerViaApi(page);
    await page.goto('/');
    await page.getByRole('button', { name: /^Account:/ }).click();
    const durations = await page.evaluate(() =>
      [...document.querySelectorAll('*')].flatMap((el) => {
        const style = getComputedStyle(el);
        return [...style.transitionDuration.split(','), ...style.animationDuration.split(',')].map(
          (d) => parseFloat(d) * (d.trim().endsWith('ms') ? 0.001 : 1),
        );
      }),
    );
    expect(Math.max(...durations)).toBeLessThanOrEqual(0.001);
  });
});
