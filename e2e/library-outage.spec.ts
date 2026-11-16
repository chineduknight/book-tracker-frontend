import { expect, test } from '@playwright/test';
import { registerViaApi, uniqueEmail } from './support/session';

/*
 * Against the fake API, where every library endpoint answers 503: an outage must never look like
 * an empty library, and a failed write must not look saved.
 */
test('an API outage is shown as unavailable, never as an empty library', async ({ page }) => {
  await registerViaApi(page, { email: uniqueEmail() });
  for (const [path, what] of [
    ['/library', 'books'],
    ['/library/wishlist', 'wishlist'],
    ['/library/locations', 'locations'],
    ['/library/categories', 'categories'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      `Your ${what} couldn’t be loaded.`,
    );
    await expect(page.getByText(/is empty|No .* yet/)).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Try again' })).toBeVisible();
  }

  await page.goto('/library/new');
  await page.getByLabel('Title').fill('Unsaved');
  await page.getByRole('button', { name: 'Add book' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('can’t be reached');
  await expect(page).toHaveURL('/library/new');
  await expect(page.getByLabel('Title')).toHaveValue('Unsaved');
});
