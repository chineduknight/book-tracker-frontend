import { expect, libraryApi, registerFreshReader, test } from './support/reader';
import { seedLending } from './support/lending';

/* Home against the real API: every number is the server's; activity claims only what was recorded. */

test('an empty account, then real counts and recorded activity, including a deleted book', async ({
  page,
  baseURL,
  isMobile,
}) => {
  test.skip(isMobile, 'registers a fresh reader once, from the desktop project');
  test.slow();
  await registerFreshReader(page, baseURL!);
  await page.goto('/');
  const main = page.getByRole('main');
  await expect(main.getByText('Your library is empty so far.')).toBeVisible();
  await expect(main.getByText('Nothing recorded yet.')).toBeVisible();
  await expect(main.getByText('No books yet, so nothing to break down.')).toBeVisible();
  await expect(main.getByText(/No loans are overdue as of/)).toBeVisible();

  const seeded = await seedLending(page, baseURL!);
  await libraryApi(page, baseURL!, 'POST', '/api/library/books', {
    title: 'Dune',
    format: 'ebook',
  });
  // A loan whose book is then deleted: still counted, and still openable from the feed.
  const gone = await libraryApi<{ id: string }>(page, baseURL!, 'POST', '/api/library/books', {
    title: 'Soon gone',
    format: 'physical',
  });
  const goneCopy = await libraryApi<{ id: string }>(
    page,
    baseURL!,
    'POST',
    `/api/library/books/${gone.id}/copies`,
    {},
  );
  const goneLoan = await libraryApi<{ id: string }>(
    page,
    baseURL!,
    'POST',
    `/api/lending/copies/${goneCopy.id}/loans`,
    { borrowerName: 'Never shown on Home', lentOn: '2026-11-02' },
  );
  await libraryApi(page, baseURL!, 'DELETE', `/api/library/books/${gone.id}`);

  await page.goto('/');
  const tile = (label: RegExp) => main.getByRole('link', { name: label });
  await expect(tile(/^Books\s*2/)).toBeVisible();
  await expect(tile(/^Physical copies\s*3/)).toBeVisible();
  await expect(tile(/^Active loans\s*3/)).toBeVisible();
  await expect(tile(/^Overdue loans\s*1/)).toBeVisible();
  await expect(main.getByText(/1 loan is overdue/)).toBeVisible();
  await main.getByRole('link', { name: 'Review overdue loans' }).click();
  await expect(page).toHaveURL(/\/lending\?status=overdue&asOf=\d{4}-\d{2}-\d{2}$/);
  await expect(page.getByRole('link', { name: seeded.borrowers.overdue })).toBeVisible();

  await page.goto('/');
  const activity = main.getByRole('region', { name: 'Recently recorded' });
  // Two visible books and four loans (one of a deleted book); copies are not events.
  await expect(activity.getByRole('listitem')).toHaveCount(6);
  await expect(activity).not.toContainText(/Never shown on Home|returned|finished/i);
  await expect(
    activity.getByRole('link', { name: 'A book no longer in your library' }),
  ).toHaveAttribute('href', `/lending/${goneLoan.id}`);
  await expect(main.getByRole('table', { name: 'Books' })).toBeVisible();
});
