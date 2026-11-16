import type { Page } from '@playwright/test';
import { navLabels, pages } from './routes';
import { expect, test } from './support/reader';

function primaryNav(page: Page) {
  return page.getByRole('navigation', { name: 'Primary' });
}

test.describe('routes', () => {
  for (const { path, heading, title, nav } of pages) {
    test(`${path} renders its page and marks ${nav} current`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);

      await expect(page).toHaveTitle(title);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expect(page.getByRole('main')).toHaveCount(1);

      const links = primaryNav(page).getByRole('link');
      await expect(links).toHaveText(navLabels);
      const current = primaryNav(page).locator('a[aria-current="page"]');
      await expect(current).toHaveCount(1);
      await expect(current).toHaveText(nav);
    });
  }

  test('page headings are unique', () => {
    const headings = pages.map((p) => p.heading);
    expect(new Set(headings).size).toBe(headings.length);
  });

  test('an unknown address shows a helpful 404 without private navigation', async ({ page }) => {
    const response = await page.goto('/no-such-page');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found');
    await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(0);

    await page.getByRole('link', { name: 'Go to Home' }).click();
    await expect(page).toHaveURL('/');
  });
});

test.describe('navigating', () => {
  test('every primary link navigates and moves the current state', async ({ page }) => {
    await page.goto('/');
    for (const label of [...navLabels.slice(1), 'Home']) {
      await primaryNav(page).getByRole('link', { name: label }).click();
      const expected = pages.find((p) => p.nav === label && !p.path.startsWith('/library/'))!;
      await expect(page).toHaveURL(expected.path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(expected.heading);
      await expect(primaryNav(page).locator('a[aria-current="page"]')).toHaveText(label);
    }
  });

  test('Library subsections link out and back', async ({ page }) => {
    await page.goto('/library');
    await page.getByRole('link', { name: 'Wishlist' }).click();
    await expect(page).toHaveURL('/library/wishlist');
    await expect(primaryNav(page).locator('a[aria-current="page"]')).toHaveText('Library');

    await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link').click();
    await expect(page).toHaveURL('/library');
  });

  test('home destination cards are real links', async ({ page }) => {
    await page.goto('/');
    const cards = page.getByRole('main').getByRole('list').getByRole('link');
    await expect(cards).toHaveText(['Library', 'Reading', 'Notes', 'Lending']);
    await cards.filter({ hasText: 'Notes' }).click();
    await expect(page).toHaveURL('/notes');
  });

  test('the unfinished tabs hold no buttons; only the account menu does', async ({ page }) => {
    // Reading, Notes and Lending have no actions yet; any button there would be a dead control.
    for (const path of ['/', '/reading', '/notes', '/lending']) {
      await page.goto(path);
      await expect(page.getByRole('main').getByRole('button')).toHaveCount(0);
      await expect(page.getByRole('banner').getByRole('button')).toHaveCount(1);
    }
  });
});

test.describe('keyboard', () => {
  test('the skip link is the first stop and moves focus to main', async ({ page }) => {
    await page.goto('/library');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();

    await page.keyboard.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();
    await page.keyboard.press('Tab');
    // The next stop is inside main, not back in the navigation.
    const insideMain = await page.evaluate(() =>
      Boolean(document.activeElement?.closest('#main-content')),
    );
    expect(insideMain).toBe(true);
  });

  test('nav links show a visible focus ring and activate with Enter', async ({ page }) => {
    await page.goto('/');
    const reading = primaryNav(page).getByRole('link', { name: 'Reading' });
    // Tab until the Reading link has focus, proving it is reachable in order.
    for (
      let i = 0;
      i < 10 && !(await reading.evaluate((el) => el === document.activeElement));
      i++
    ) {
      await page.keyboard.press('Tab');
    }
    await expect(reading).toBeFocused();
    const outline = await reading.evaluate((el) => {
      const style = getComputedStyle(el);
      return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
    });
    expect(outline.style).toBe('solid');
    expect(outline.width).toBeGreaterThanOrEqual(2);

    await page.keyboard.press('Enter');
    await expect(page).toHaveURL('/reading');
    await expect(primaryNav(page).locator('a[aria-current="page"]')).toHaveText('Reading');
  });

  test('focus can travel through the whole page and wrap around (no traps)', async ({ page }) => {
    await page.goto('/notes');
    const seen: string[] = [];
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      const label = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
      if (i > 0 && label === 'Skip to content') {
        seen.push(label);
        break;
      }
      seen.push(label);
    }
    expect(seen.at(-1)).toBe('Skip to content');
    for (const label of navLabels) expect(seen).toContain(label);
    expect(seen).toContain('Go to Reading');
  });
});
