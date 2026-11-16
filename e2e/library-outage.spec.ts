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

test('reading and notes outages are shown as unavailable, never as "no readings" or "no notes"', async ({
  page,
}) => {
  await registerViaApi(page, { email: uniqueEmail() });
  for (const [path, what] of [
    ['/reading', 'reading history'],
    ['/notes', 'notes'],
    ['/notes?kind=highlight&q=anything', 'notes'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      `Your ${what} couldn’t be loaded.`,
    );
    await expect(page.getByText(/No readings yet|No notes yet|No notes match/)).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Try again' })).toBeVisible();
  }
});

test('a healthy book stays readable when only its reading and notes are down', async ({ page }) => {
  await registerViaApi(page, { email: uniqueEmail() });
  await page.goto('/library/books/0000000000000000000000b0');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('A Healthy Book');
  await expect(page.getByText('Reading details couldn’t be loaded.')).toBeVisible();
  await expect(page.getByText('Notes for this book couldn’t be loaded.')).toBeVisible();
  await expect(page.getByText('Not read yet')).toHaveCount(0);
  await expect(page.getByText('No notes or highlights for this book yet.')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Categories and collections' })).toBeVisible();
});

test('a note cannot be saved while the catalogue is down, and its text is kept', async ({
  page,
}) => {
  await registerViaApi(page, { email: uniqueEmail() });
  await page.goto('/notes/new');
  await page.getByRole('radio', { name: /Note/ }).first().check();
  await page.getByLabel('Your note').fill('Kept through the outage');
  await page.getByRole('button', { name: 'Save note' }).click();
  // No book can be chosen while the catalogue is down, so nothing is sent and the text stays.
  await expect(page.getByText('Choose the book this note is about.')).toBeVisible();
  await expect(
    page.getByText('Your library couldn’t be searched right now. Try again.'),
  ).toBeVisible();
  await expect(page.getByLabel('Your note')).toHaveValue('Kept through the outage');
});

test('a lending outage is shown as unavailable, never as "no loans"', async ({ page }) => {
  await registerViaApi(page, { email: uniqueEmail() });
  for (const path of ['/lending', '/lending?status=overdue', '/lending?status=all']) {
    await page.goto(path);
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      'Your loans couldn’t be loaded.',
    );
    await expect(page.getByText(/No loans yet|Nothing is on loan|Nothing is overdue/)).toHaveCount(
      0,
    );
  }
  await page.goto(`/lending/new?copyId=${'0'.repeat(23)}1`);
  await expect(page.getByRole('main').getByRole('alert')).toContainText('couldn’t be loaded');
  await expect(page.getByRole('button', { name: 'Record loan' })).toHaveCount(0);
});

test('Home shows each failed section as an error, never as zeroes', async ({ page }, testInfo) => {
  await registerViaApi(page, { email: uniqueEmail() });
  await page.goto('/');
  const main = page.getByRole('main');
  await expect(main.getByText('Your library’s numbers couldn’t be loaded.')).toBeVisible();
  await expect(main.getByText('Reading statistics couldn’t be loaded.')).toBeVisible();
  await expect(main.getByText('Recent activity couldn’t be loaded.')).toBeVisible();
  await expect(
    main.getByText(/No loans are overdue|Your library is empty|Nothing recorded yet/),
  ).toHaveCount(0);
  await expect(
    main.getByRole('navigation', { name: 'Quick actions' }).getByRole('link'),
  ).toHaveCount(5);

  // One section healthy, the others down: the healthy one still shows its real numbers.
  await page.context().clearCookies();
  await registerViaApi(page, { email: uniqueEmail('+summaryok') });
  await page.goto('/');
  await expect(main.getByRole('link', { name: /^Books 3 / })).toBeVisible();
  await expect(main.getByText('1 loan is overdue', { exact: false })).toBeVisible();
  await expect(main.getByText('Reading statistics couldn’t be loaded.')).toBeVisible();
  await expect(main.getByText('Recent activity couldn’t be loaded.')).toBeVisible();
  await page.screenshot({
    path: `screenshots/ld-${testInfo.project.name}-home-partial-outage.png`,
    fullPage: true,
  });
});
