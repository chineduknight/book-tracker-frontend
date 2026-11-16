import type { Page } from '@playwright/test';
import { expect, libraryApi, registerFreshReader, test, uniqueWord } from './support/reader';
import { BROWSER_LEAK } from './support/leaks';

/* Lending against the real API: one copy, one active loan; explicit days; honest outcomes. */

async function bookWithCopies(page: Page, origin: string, count: number) {
  const title = uniqueWord('Lend');
  const book = await libraryApi<{ id: string }>(page, origin, 'POST', '/api/library/books', {
    title,
    format: 'physical',
  });
  const copyIds: string[] = [];
  for (let index = 1; index <= count; index += 1) {
    const copy = await libraryApi<{ id: string }>(
      page,
      origin,
      'POST',
      `/api/library/books/${book.id}/copies`,
      { label: `Copy ${index}` },
    );
    copyIds.push(copy.id);
  }
  return { id: book.id, title, copyIds };
}

test('lend a copy found past the first page, return it, and lend it again', async ({
  page,
  baseURL,
}) => {
  test.slow();
  const book = await bookWithCopies(page, baseURL!, 21);
  const borrower = uniqueWord('Ada');

  await page.goto('/lending/new');
  await page.getByLabel('Which book are you lending?').fill(book.title);
  await page.getByRole('button', { name: new RegExp(`^Choose ${book.title}`) }).click();
  await expect(page).toHaveURL(`/lending/new?bookId=${book.id}`);
  await expect(page.getByText('Page 1 of 2 · 21 copies')).toBeVisible();
  await page.getByRole('link', { name: 'Next' }).click();
  const row = page.getByRole('main').getByRole('listitem');
  await expect(row).toHaveCount(1);
  const copyLabel = (await row.locator('p').first().textContent())!.trim();
  await row.getByRole('link', { name: `Lend this copy: ${copyLabel}` }).click();

  await expect(page).toHaveURL(/\/lending\/new\?copyId=[0-9a-f]{24}$/);
  const copyId = new URL(page.url()).searchParams.get('copyId')!;
  await expect(page.getByText('Not on loan right now.')).toBeVisible();
  await page.getByLabel('Borrower').fill(borrower);
  await page.getByLabel('Lent on').fill('2026-11-01');
  await page.getByLabel('Due back (optional)').fill('2026-11-20');
  await page.getByRole('button', { name: 'Record loan' }).click();

  await expect(page).toHaveURL(/\/lending\/[0-9a-f]{24}\?notice=loan-created$/);
  const loanPath = new URL(page.url()).pathname;
  await expect(page.getByText('Loan recorded.')).toBeVisible();
  await expect(page.getByText('Lent 1 Nov 2026 · Due 20 Nov 2026')).toBeVisible();

  await page.goto('/lending');
  await expect(page.getByRole('link', { name: borrower })).toBeVisible();
  await page.getByRole('link', { name: borrower }).click();

  // Escape abandons the pending day; the reopened dialog starts empty.
  const opener = page.getByRole('button', { name: 'Mark returned…' });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Mark this loan as returned?' });
  await dialog.getByLabel('Returned on').fill('2026-11-09');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  await opener.click();
  await expect(dialog.getByLabel('Returned on')).toHaveValue('');
  await dialog.getByLabel('Returned on').fill('2026-11-10');
  await dialog.getByRole('button', { name: 'Mark returned' }).click();

  await expect(page.getByText(/Marked returned/)).toBeVisible();
  await expect(
    page.getByText('Lent 1 Nov 2026 · Due 20 Nov 2026 · Returned 10 Nov 2026'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark returned…' })).toHaveCount(0);

  const loanId = loanPath.split('/').at(-1)!;
  const same = await page.request.put(`/api/lending/loans/${loanId}/return`, {
    headers: { Origin: baseURL! },
    data: { returnedOn: '2026-11-10' },
  });
  expect(same.status()).toBe(200);
  const other = await page.request.put(`/api/lending/loans/${loanId}/return`, {
    headers: { Origin: baseURL! },
    data: { returnedOn: '2026-11-11' },
  });
  expect(other.status()).toBe(409);
  expect((await other.json()).error.code).toBe('LOAN_ALREADY_RETURNED');

  await page.reload();
  await page.getByRole('link', { name: 'Record a new loan of this copy' }).click();
  await expect(page).toHaveURL(`/lending/new?copyId=${copyId}`);
  await page.getByLabel('Borrower').fill(`${borrower} again`);
  await page.getByLabel('Lent on').fill('2026-11-12');
  await page.getByRole('button', { name: 'Record loan' }).click();
  await expect(page).toHaveURL(/notice=loan-created/);

  await page.getByRole('link', { name: 'This copy’s loans' }).click();
  const loans = page.getByRole('main').getByRole('listitem');
  await expect(loans).toHaveCount(2);
  await expect(loans.filter({ hasText: borrower }).filter({ hasText: 'Returned' })).toHaveCount(1);

  await page.goto(`/library/books/${book.id}`);
  await page.getByRole('button', { name: `Check loan status of ${copyLabel}` }).click();
  await expect(page.getByText(`On loan to ${borrower} again since 12 Nov 2026.`)).toBeVisible();
});

test('refuses incomplete loans, never duplicates a loan, and is honest about unknown outcomes', async ({
  page,
  baseURL,
}) => {
  const book = await bookWithCopies(page, baseURL!, 2);
  const [first, second] = book.copyIds as [string, string];

  await page.goto(`/lending/new?copyId=${first}`);
  await page.getByRole('button', { name: 'Record loan' }).click();
  await expect(page.getByText('Enter who is borrowing the copy.')).toBeVisible();
  await expect(page.getByText('Enter the day you lent it.')).toBeVisible();
  await expect(page.getByLabel('Borrower')).toBeFocused();

  await page.getByLabel('Borrower').fill('Grace');
  await page.getByLabel('Lent on').fill('2026-03-10');
  await page.getByLabel('Due back (optional)').fill('2026-03-01');
  await page.getByRole('button', { name: 'Record loan' }).click();
  await expect(page.getByText('The due date can’t be before the lent date.')).toBeVisible();
  await page.getByLabel('Due back (optional)').fill('2026-03-24');

  // Meanwhile, on another device:
  await libraryApi(page, baseURL!, 'POST', `/api/lending/copies/${first}/loans`, {
    borrowerName: 'Elsewhere',
    lentOn: '2026-03-09',
  });
  await page.getByRole('button', { name: 'Record loan' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'This copy is already lent.',
  );
  await expect(page.getByLabel('Borrower')).toHaveValue('Grace');
  // The typed details are unsaved, so leaving asks first.
  await page.getByRole('link', { name: 'Open the current loan' }).click();
  const leave = page.getByRole('dialog', { name: 'Discard unsaved changes?' });
  await leave.getByRole('button', { name: 'Discard changes' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lent to Elsewhere');

  // A request whose outcome is unknown is reported as such and never retried.
  await page.goto(`/lending/new?copyId=${second}`);
  let posts = 0;
  await page.route(`**/api/lending/copies/${second}/loans`, (route) => {
    posts += 1;
    return route.abort('failed');
  });
  await page.getByLabel('Borrower').fill('Unsure');
  await page.getByLabel('Lent on').fill('2026-03-11');
  await page.getByRole('button', { name: 'Record loan' }).click();
  await expect(
    page.getByText('Avuneri couldn’t confirm whether the loan was saved.'),
  ).toBeVisible();
  await expect(page.getByLabel('Borrower')).toHaveValue('Unsure');
  expect(posts).toBe(1);
  await page.unroute(`**/api/lending/copies/${second}/loans`);

  // Two copies of one book can be out at the same time.
  await libraryApi(page, baseURL!, 'POST', `/api/lending/copies/${second}/loans`, {
    borrowerName: 'Second',
    lentOn: '2026-03-12',
  });
  for (const [copyId, name] of [
    [first, 'Elsewhere'],
    [second, 'Second'],
  ] as const) {
    await page.goto(`/lending/copies/${copyId}`);
    await expect(page.getByText(`On loan now to ${name}.`)).toBeVisible();
  }
});

test('overdue follows the stated reference day; due on that day is not overdue', async ({
  page,
  baseURL,
}) => {
  const book = await bookWithCopies(page, baseURL!, 2);
  const late = uniqueWord('Late');
  const back = uniqueWord('Back');
  await libraryApi(page, baseURL!, 'POST', `/api/lending/copies/${book.copyIds[0]}/loans`, {
    borrowerName: late,
    lentOn: '2026-01-01',
    dueOn: '2026-01-10',
  });
  const returned = await libraryApi<{ id: string }>(
    page,
    baseURL!,
    'POST',
    `/api/lending/copies/${book.copyIds[1]}/loans`,
    { borrowerName: back, lentOn: '2026-01-01', dueOn: '2026-01-02' },
  );
  await libraryApi(page, baseURL!, 'PUT', `/api/lending/loans/${returned.id}/return`, {
    returnedOn: '2026-01-05',
  });

  await page.goto('/lending');
  await page
    .getByRole('navigation', { name: 'Loan status' })
    .getByRole('link', { name: /^Overdue/ })
    .click();
  await expect(page).toHaveURL('/lending?status=overdue');
  await expect(page.getByText('(today, as a UTC calendar day)')).toBeVisible();
  const lateRow = page.getByRole('main').getByRole('listitem').filter({ hasText: late });
  await expect(lateRow.getByText(/^Overdue, due 10 Jan 2026$/)).toBeVisible();
  await expect(page.getByRole('link', { name: back })).toHaveCount(0);

  await page.getByLabel('Overdue as of').fill('2026-01-10');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get('asOf') === '2026-01-10');
  await expect(page.getByText('(the day you chose)')).toBeVisible();
  await expect(page.getByRole('link', { name: late })).toHaveCount(0);
  await page.getByLabel('Overdue as of').fill('2026-01-11');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByRole('link', { name: late })).toBeVisible();

  await page
    .getByRole('navigation', { name: 'Loan status' })
    .getByRole('link', { name: /^Returned/ })
    .click();
  await expect(
    page
      .getByRole('main')
      .getByRole('listitem')
      .filter({ hasText: back })
      .getByText('Returned', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Loan status' }).locator('a[aria-current="page"]'),
  ).toContainText('Returned');

  await page.goto('/lending?page=999');
  await expect(page.getByText('There are no loans on this page')).toBeVisible();
});

test('a loan outlives its book: still listed, readable and returnable', async ({
  page,
  baseURL,
}) => {
  const book = await bookWithCopies(page, baseURL!, 1);
  const borrower = uniqueWord('Kept');
  const loan = await libraryApi<{ id: string }>(
    page,
    baseURL!,
    'POST',
    `/api/lending/copies/${book.copyIds[0]}/loans`,
    { borrowerName: borrower, lentOn: '2026-05-01' },
  );
  await page.goto(`/library/books/${book.id}`);
  await page.getByRole('button', { name: 'Delete book' }).click();
  await expect(page.getByRole('dialog')).toContainText('Loans of its copies stay in Lending');
  await page.getByRole('dialog').getByRole('button', { name: 'Delete book' }).click();
  await expect(page).toHaveURL(/notice=book-deleted/);

  await page.goto('/lending');
  await page.getByRole('link', { name: borrower }).click();
  await expect(page).toHaveURL(`/lending/${loan.id}`);
  await expect(page.getByText('Book no longer in your library')).toBeVisible();
  await expect(page.getByText(/Copy #[0-9a-f]{6} no longer available/)).toBeVisible();
  await expect(page.getByRole('link', { name: book.title })).toHaveCount(0);
  await page.getByRole('button', { name: 'Mark returned…' }).click();
  await page.getByRole('dialog').getByLabel('Returned on').fill('2026-05-20');
  await page.getByRole('dialog').getByRole('button', { name: 'Mark returned' }).click();
  await expect(
    page.getByText('Lent 1 May 2026 · No due date · Returned 20 May 2026'),
  ).toBeVisible();
});

test('lending is private: origin and session checks, no tokens, nothing for another reader', async ({
  page,
  playwright,
  baseURL,
  isMobile,
}) => {
  const book = await bookWithCopies(page, baseURL!, 1);
  const secret = uniqueWord('Secret');
  const loan = await libraryApi<{ id: string }>(
    page,
    baseURL!,
    'POST',
    `/api/lending/copies/${book.copyIds[0]}/loans`,
    { borrowerName: secret, borrowerContact: `${secret}@example.test`, lentOn: '2026-05-01' },
  );
  const writes: Array<[string, string, unknown]> = [
    [
      'POST',
      `/api/lending/copies/${book.copyIds[0]}/loans`,
      { borrowerName: 'F', lentOn: '2026-05-02' },
    ],
    ['PATCH', `/api/lending/loans/${loan.id}`, { note: 'Forged' }],
    ['PUT', `/api/lending/loans/${loan.id}/return`, { returnedOn: '2026-05-02' }],
  ];
  for (const [method, path, data] of writes) {
    const forged = await page.request.fetch(path, {
      method,
      headers: { Origin: 'https://evil.example' },
      data,
    });
    expect(forged.status(), `${method} ${path}`).toBe(403);
  }
  const anonymous = await playwright.request.newContext({
    baseURL: baseURL!,
    storageState: { cookies: [], origins: [] },
  });
  for (const [method, path, data] of writes) {
    expect(
      (await anonymous.fetch(path, { method, headers: { Origin: baseURL! }, data })).status(),
    ).toBe(401);
  }
  expect((await anonymous.get(`/api/lending/copies/${book.copyIds[0]}/overview`)).status()).toBe(
    401,
  );
  await anonymous.dispose();

  const bodies: string[] = [];
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  page.on('response', async (response) => {
    if (!response.url().startsWith(baseURL!)) return;
    try {
      bodies.push(await response.text());
    } catch {
      // Redirects have no body.
    }
  });
  for (const path of [
    '/',
    '/lending',
    `/lending/${loan.id}`,
    `/lending/copies/${book.copyIds[0]}`,
  ]) {
    await page.goto(path);
    expect((await page.request.get(path)).headers()['cache-control']).toMatch(/no-store/);
  }
  expect(requests.filter((url) => !url.startsWith(baseURL!))).toEqual([]);
  expect(bodies.join('\n')).not.toMatch(BROWSER_LEAK);
  expect(await page.title()).not.toContain(secret);

  test.skip(isMobile, 'another reader is registered once, from the desktop project');
  await registerFreshReader(page, baseURL!);
  for (const path of [
    `/lending/${loan.id}`,
    `/lending/copies/${book.copyIds[0]}`,
    `/lending/new?copyId=${book.copyIds[0]}`,
  ]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible();
    await expect(page.getByText(secret)).toHaveCount(0);
  }
  const foreign = await page.request.fetch(`/api/lending/loans/${loan.id}`, {
    method: 'PATCH',
    headers: { Origin: baseURL! },
    data: { note: 'mine' },
  });
  expect(foreign.status()).toBe(404);
  expect(await foreign.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Loan not found' } });
  await page.goto('/lending?status=all');
  await expect(page.getByRole('heading', { name: 'No loans yet' })).toBeVisible();
});
