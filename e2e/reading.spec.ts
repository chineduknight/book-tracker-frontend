import type { Page } from '@playwright/test';
import { expect, libraryApi, test, uniqueWord } from './support/reader';

/* Reading sessions against the real API: state transitions, rereads and honest dates. */

async function newBook(page: Page, origin: string, extra: Record<string, unknown> = {}) {
  const title = uniqueWord('Reading');
  const book = await libraryApi<{ id: string }>(page, origin, 'POST', '/api/library/books', {
    title,
    authors: ['Jane Austen'],
    format: 'physical',
    ...extra,
  });
  return { id: book.id, title };
}

test('start from the book, progress to the last page, finish explicitly, then reread', async ({
  page,
  baseURL,
}) => {
  const book = await newBook(page, baseURL!, { pageCount: 320 });
  await page.goto(`/library/books/${book.id}`);
  const reading = page.getByRole('region', { name: 'Reading' });
  await expect(reading.getByText('Not read yet')).toBeVisible();
  await expect(reading.getByText('0 readings · 0 finished')).toBeVisible();
  await reading.getByRole('link', { name: 'Start reading' }).click();

  await expect(page).toHaveURL(`/reading/new?bookId=${book.id}`);
  await page.getByRole('button', { name: 'Start reading' }).click();
  await expect(page).toHaveURL(/\/reading\/[0-9a-f]{24}\?notice=reading-started$/);
  const sessionPath = new URL(page.url()).pathname;
  await expect(page.getByText('No dates recorded')).toBeVisible();

  await page.getByLabel('Measured in').selectOption('pages');
  await page.getByLabel('Amount').fill('321');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('This book has 320 pages; enter at most 320.')).toBeVisible();
  await expect(page.getByLabel('Amount')).toBeFocused();

  await page.getByLabel('Amount').fill('320');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Changes saved.')).toBeVisible();
  await expect(page.getByText('Page 320 of 320')).toBeVisible();
  // Reaching the last page never finishes the reading by itself.
  await expect(page.getByRole('button', { name: 'Mark as finished…' })).toBeVisible();

  // Escape closes the confirmation without changing anything, and focus returns.
  const finish = page.getByRole('button', { name: 'Mark as finished…' });
  await finish.click();
  const dialog = page.getByRole('dialog', { name: 'Mark this reading as finished?' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(finish).toBeFocused();

  await finish.click();
  await dialog.getByRole('button', { name: 'Mark as finished' }).click();
  await expect(
    page.getByText('Reading marked as finished. It stays in your history.'),
  ).toBeVisible();
  await expect(page.getByText('No dates recorded')).toBeVisible(); // no finish date invented
  await expect(page.getByRole('button', { name: 'Mark as finished…' })).toHaveCount(0);

  await page.goto(`/library/books/${book.id}`);
  await expect(reading.getByText('1 reading · 1 finished')).toBeVisible();
  await reading.getByRole('link', { name: 'Reread' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Reread “${book.title}”`);
  await page.getByRole('button', { name: 'Start reading' }).click();
  await expect(page).toHaveURL(/notice=reading-started/);
  await expect(page.getByText('Rereading').first()).toBeVisible();

  // The first reading is untouched.
  await page.goto(sessionPath);
  await expect(page.getByText('Page 320 of 320')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Correct this reading' })).toBeVisible();

  await page.goto(`/library/books/${book.id}`);
  await expect(reading.getByText('Rereading').first()).toBeVisible();
  await expect(reading.getByText('2 readings · 1 finished')).toBeVisible();
  await expect(reading.getByRole('link', { name: 'Continue rereading' })).toBeVisible();
});

test('records a past read with real calendar days, refusing an impossible order', async ({
  page,
  baseURL,
}) => {
  const book = await newBook(page, baseURL!);
  await page.goto(`/reading/new?bookId=${book.id}`);
  await page.getByRole('radio', { name: /A read I’ve already finished/ }).check();
  await page.getByLabel('Started on (optional)').fill('2028-02-29');
  await page.getByLabel('Finished on (optional)').fill('2028-02-28');
  await page.getByLabel('Rating (optional)').selectOption('4');
  await page.getByRole('button', { name: 'Record finished read' }).click();
  await expect(page.getByText('The finish date can’t be before the start date.')).toBeVisible();
  await expect(page.getByLabel('Finished on (optional)')).toBeFocused();

  await page.getByLabel('Finished on (optional)').fill('2028-03-01');
  await page.getByRole('button', { name: 'Record finished read' }).click();
  await expect(page).toHaveURL(/notice=reading-recorded/);
  // Exactly the days entered, whatever the browser's time zone.
  await expect(page.getByText('Started 29 Feb 2028 · Finished 1 Mar 2028')).toBeVisible();
  await expect(page.getByText('Rated 4 out of 5')).toBeAttached();
});

test.describe('in another time zone', () => {
  test.use({ timezoneId: 'Pacific/Kiritimati' });

  test('calendar days never shift', async ({ page, baseURL }) => {
    const book = await newBook(page, baseURL!);
    const session = await libraryApi<{ id: string }>(
      page,
      baseURL!,
      'POST',
      `/api/reading/books/${book.id}/sessions`,
      { status: 'completed', startedOn: '2026-01-01', completedOn: '2026-12-31' },
    );
    await page.goto(`/reading/${session.id}`);
    await expect(page.getByText('Started 1 Jan 2026 · Finished 31 Dec 2026')).toBeVisible();
    await expect(page.getByLabel('Started on (optional)')).toHaveValue('2026-01-01');
  });
});

test('a reading started on another device is never duplicated', async ({ page, baseURL }) => {
  const book = await newBook(page, baseURL!);
  await page.goto(`/reading/new?bookId=${book.id}`);
  // Meanwhile, elsewhere:
  await libraryApi(page, baseURL!, 'POST', `/api/reading/books/${book.id}/sessions`, {});
  await page.getByRole('button', { name: 'Start reading' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'You’re already reading this book.',
  );
  await page.getByRole('link', { name: /Continue your current reading/ }).click();
  await expect(page).toHaveURL(/\/reading\/[0-9a-f]{24}$/);
  await page.goto(`/library/books/${book.id}`);
  await expect(
    page.getByRole('region', { name: 'Reading' }).getByText('1 reading · 0 finished'),
  ).toBeVisible();
});

test('a finished reading cannot be reopened, even by a forged request', async ({
  page,
  baseURL,
}) => {
  const book = await newBook(page, baseURL!);
  const session = await libraryApi<{ id: string }>(
    page,
    baseURL!,
    'POST',
    `/api/reading/books/${book.id}/sessions`,
    { status: 'completed' },
  );
  const reopen = await page.request.fetch(`/api/reading/sessions/${session.id}`, {
    method: 'PATCH',
    headers: { Origin: baseURL! },
    data: { status: 'in_progress' },
  });
  expect(reopen.status()).toBe(409);
  expect((await reopen.json()).error.code).toBe('INVALID_READING_TRANSITION');
  await page.goto(`/reading/${session.id}`);
  await expect(page.getByRole('button', { name: 'Mark as finished…' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Start a reread' })).toBeVisible();
});

test('history filters by status and order, and starts a reading from the picker', async ({
  page,
  baseURL,
}) => {
  const book = await newBook(page, baseURL!);
  await libraryApi(page, baseURL!, 'POST', `/api/reading/books/${book.id}/sessions`, {
    status: 'completed',
  });
  await page.goto('/reading');
  await page.getByLabel('Show').selectOption('completed');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get('status') === 'completed');
  const rows = page.getByRole('main').getByRole('listitem');
  await expect(rows.filter({ hasText: book.title })).toHaveCount(1);
  await expect(rows.filter({ hasText: 'Reading now' })).toHaveCount(0);
  await expect(page.getByText(/\d+ in progress · \d+ finished/)).toBeVisible();

  await page.goto('/reading?page=9999');
  await expect(page.getByText('There are no readings on this page')).toBeVisible();

  await page.goto('/reading');
  const toggle = page.getByRole('button', { name: 'Choose a book to read' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await page.getByLabel('Find a book in your library').fill(book.title);
  await page.getByRole('button', { name: new RegExp(`^Read this ${book.title}`) }).click();
  await expect(page).toHaveURL(`/reading/new?bookId=${book.id}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Reread “${book.title}”`);
});
