import type { Page } from '@playwright/test';
import {
  expect,
  libraryApi,
  READER_PASSWORD,
  registerFreshReader,
  registerReader,
  test,
  uniqueWord,
} from './support/reader';

/* Journeys against the real, merged API (see playwright.config.ts). */

async function addBook(
  page: Page,
  fields: { title: string; author?: string; format?: 'Physical' | 'Ebook' },
) {
  // Firefox aborts a page.goto that starts while the previous page is still refreshing
  // (NS_BINDING_ABORTED), so let it settle first.
  await page.waitForLoadState('networkidle');
  await page.goto('/library/new');
  await page.getByLabel('Title').fill(fields.title);
  if (fields.author) await page.getByLabel(/^Authors/).fill(fields.author);
  if (fields.format) await page.getByRole('radio', { name: fields.format }).check();
  await page.getByRole('button', { name: 'Add book' }).click();
  await expect(page).toHaveURL(/\/library\/books\/[0-9a-f]{24}\?notice=book-created$/);
  // Let the client navigation finish rendering the book before the next step.
  await expect(page.getByRole('heading', { level: 1 })).toContainText(fields.title);
  return page.url().split('?')[0]!;
}

test(
  'the full library journey, from an empty library',
  { tag: '@critical' },
  async ({ page, baseURL }) => {
    test.slow();
    await registerFreshReader(page, baseURL!);
    const word = uniqueWord('journey');

    // Empty library: an honest first-book state, not a fake count.
    await page.goto('/library');
    await expect(page.getByRole('heading', { name: 'Your library is empty' })).toBeVisible();
    await page.getByRole('link', { name: 'Add your first book' }).click();
    await expect(page).toHaveURL('/library/new');

    // A location to store copies in.
    await page.goto('/library/locations');
    await page.getByLabel('Location name').fill(`Study ${word}`);
    await page.getByRole('button', { name: 'Add location' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'The location was created.' }),
    ).toBeVisible();

    // A physical book with two distinct copies, one stored on the shelf.
    const bookUrl = await addBook(page, { title: `Middlemarch ${word}`, author: 'George Eliot' });
    await expect(page.getByRole('status').filter({ hasText: 'Book added' })).toBeVisible();
    await page.getByRole('button', { name: 'Add a copy' }).click();
    await page.getByLabel(/^Label/).fill('Signed hardback');
    await page.getByLabel('Condition').selectOption('like_new');
    await page.getByLabel('Location').selectOption({ label: `Study ${word}` });
    await page.getByRole('button', { name: 'Add copy' }).click();
    await expect(
      page.locator('li > div > div > p').filter({ hasText: /^Signed hardback #[0-9a-f]{6}$/ }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Add a copy' }).click();
    await page.getByRole('button', { name: 'Add copy' }).click();
    await expect(page.getByText(/^Unlabelled copy #[0-9a-f]{6}$/)).toBeVisible();
    await expect(page.getByText('Unassigned', { exact: true })).toBeVisible();

    // Organise: a category from a preset suggestion and a collection.
    await page.goto('/library/categories');
    await page.getByRole('button', { name: 'Philosophy', exact: true }).click();
    await page.getByRole('button', { name: 'Add category' }).click();
    await expect(page.getByRole('link', { name: 'Philosophy' })).toBeVisible();
    await page.goto('/library/collections');
    await page.getByLabel('Collection name').fill(`Reading list ${word}`);
    await page.getByRole('button', { name: 'Add collection' }).click();
    await page.goto(bookUrl);
    await page.getByLabel('Add to a category').selectOption({ label: 'Philosophy' });
    await page.getByRole('button', { name: 'Add', exact: true }).first().click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Added to Philosophy.' }),
    ).toBeVisible();
    await page.getByLabel('Add to a collection').selectOption({ label: `Reading list ${word}` });
    await page.getByRole('button', { name: 'Add', exact: true }).last().click();
    await expect(page.getByRole('link', { name: `Reading list ${word}` })).toBeVisible();

    // Search and filter with the API's whole-word semantics.
    await page.goto('/library');
    await page.getByLabel('Search titles and authors').fill(`eliot ${word}`);
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page).toHaveURL(new RegExp(`q=eliot\\+${word}`));
    await expect(page.getByRole('link', { name: `Middlemarch ${word}` })).toBeVisible();
    await page.goto(`/library?q=${word.slice(0, 6)}`);
    await expect(page.getByRole('heading', { name: 'No books match' })).toBeVisible();

    // Edit, then a wish acquired with this book.
    await page.goto(`${bookUrl}/edit`);
    await page.getByLabel('Edition (optional)').fill('Penguin Classics');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page).toHaveURL(/notice=book-saved/);
    await expect(page.getByText('Penguin Classics')).toBeVisible();

    await page.goto('/library/wishlist/new');
    await page.getByLabel('Title').fill(`Middlemarch annotated ${word}`);
    await page.getByLabel('Priority').selectOption('high');
    await page.getByRole('button', { name: 'Add to wishlist' }).click();
    await expect(page).toHaveURL(/notice=wish-created/);
    await page.getByLabel('Find the book in your library').fill(word);
    await page.getByRole('button', { name: `Choose Middlemarch ${word}` }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Mark acquired' }).click();
    await expect(page.getByText(/^Acquired on/)).toBeVisible();
    await page.goto('/library/wishlist');
    await expect(page.getByRole('heading', { name: 'Your wishlist is empty' })).toBeVisible();

    // The catalogue never counts wishes.
    await page.goto('/library');
    await expect(page.getByText('1 book in your library')).toBeVisible();

    // Delete: confirmed, soft, and gone from every view.
    await page.goto(bookUrl);
    await page.getByRole('button', { name: 'Delete book' }).click();
    await expect(page.getByRole('dialog')).toContainText('no way to restore the book');
    await expect(page.getByRole('dialog')).toContainText('Loans of its copies stay in Lending');
    await page.getByRole('dialog').getByRole('button', { name: 'Delete book' }).click();
    await expect(page).toHaveURL('/library?notice=book-deleted');
    await expect(page.getByRole('heading', { name: 'Your library is empty' })).toBeVisible();
    expect((await page.goto(bookUrl))?.status()).toBe(404);
  },
);

test('an ebook offers no copies', async ({ page }) => {
  const url = await addBook(page, { title: uniqueWord('Ebook'), format: 'Ebook' });
  await page.goto(url);
  await expect(page.getByText('Ebooks have no physical copies')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add a copy' })).toHaveCount(0);
});

test('duplicate titles are suggested, never blocked', async ({ page }) => {
  const title = `Twice ${uniqueWord('dup')}`;
  await addBook(page, { title });
  await page.goto('/library/new');
  await page.getByLabel('Title').fill(title.toUpperCase());
  await expect(page.getByText('You may already have this book')).toBeVisible();
  await page.getByRole('button', { name: 'Add book' }).click();
  await expect(page).toHaveURL(/notice=book-created/);
});

test('a book with copy history cannot become an ebook, and unsaved edits survive', async ({
  page,
}) => {
  const url = await addBook(page, { title: uniqueWord('Copied') });
  await page.getByRole('button', { name: 'Add a copy' }).click();
  await page.getByRole('button', { name: 'Add copy' }).click();
  await expect(page.getByText(/^Unlabelled copy #[0-9a-f]{6}$/)).toBeVisible();

  await page.goto(`${url}/edit`);
  await page.getByLabel('Edition (optional)').fill('Second edition');
  await page.getByRole('radio', { name: 'Ebook' }).check();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('cannot become an ebook')).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Ebook' })).toBeFocused();
  await expect(page.getByLabel('Edition (optional)')).toHaveValue('Second edition');
  await page.getByRole('button', { name: /Keep it physical/ }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page).toHaveURL(/notice=book-saved/);
});

test('a duplicate location name is refused on the field', async ({ page }) => {
  const name = `Office ${uniqueWord('loc')}`;
  await page.goto('/library/locations');
  await page.getByLabel('Location name').fill(name);
  await page.getByRole('button', { name: 'Add location' }).click();
  await expect(page.getByRole('button', { name: `Edit ${name}` })).toBeVisible();
  await page.getByLabel('Location name').fill(name.toUpperCase());
  await page.getByRole('button', { name: 'Add location' }).click();
  await expect(page.getByLabel('Location name')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('A location with this name already exists.')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Delete/ })).toHaveCount(0);
});

test(
  'a missing or another reader’s book is the same in-shell 404',
  { tag: '@critical' },
  async ({ page, browser, baseURL }) => {
    expect((await page.goto('/library/books/0123456789abcdef01234567'))?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();

    const url = await addBook(page, { title: uniqueWord('Mine') });
    const stranger = await browser.newContext({
      baseURL: baseURL!,
      storageState: { cookies: [], origins: [] },
    });
    const strangerPage = await stranger.newPage();
    await registerReader(strangerPage.request, baseURL!);
    expect((await strangerPage.goto(url))?.status()).toBe(404);
    await expect(strangerPage.getByRole('heading', { name: 'Not found' })).toBeVisible();
    await stranger.close();
  },
);

test('an ended session sends a write to sign-in and comes back', async ({
  page,
  browser,
  baseURL,
  reader,
}) => {
  // A separate session for this reader, so ending it leaves the worker's shared session alone.
  const context = await browser.newContext({
    baseURL: baseURL!,
    storageState: { cookies: [], origins: [] },
  });
  const own = await context.newPage();
  await own.request.post('/api/session/login', {
    data: { email: reader.email, password: READER_PASSWORD },
    headers: { Origin: baseURL! },
  });
  await own.goto('/library/new');
  await own.getByLabel('Title').fill(uniqueWord('Late'));
  await own.request.post('/api/session/logout', { data: {}, headers: { Origin: baseURL! } });
  await own.getByRole('button', { name: 'Add book' }).click();
  await expect(own).toHaveURL('/login?next=%2Flibrary%2Fnew');
  await own.getByLabel('Email').fill(reader.email);
  await own.getByLabel('Password', { exact: true }).fill(READER_PASSWORD);
  await own.getByRole('button', { name: 'Sign in' }).click();
  await expect(own).toHaveURL('/library/new');
  await context.close();
  void page;
});

test('rate limiting and outages on writes are explained, and nothing looks saved', async ({
  page,
}) => {
  await page.goto('/library/new');
  await page.getByLabel('Title').fill(uniqueWord('Throttled'));
  // Simulated at the browser boundary: the real API cannot be made to throttle on demand.
  await page.route('**/api/library/books', (route) =>
    route.fulfill({
      status: 429,
      headers: { 'Retry-After': '120' },
      json: { error: { code: 'RATE_LIMITED', message: 'x', retryAfterSeconds: 120 } },
    }),
  );
  await page.getByRole('button', { name: 'Add book' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Wait about 2 minutes');
  await expect(page).toHaveURL('/library/new');

  await page.unroute('**/api/library/books');
  await page.route('**/api/library/books', (route) =>
    route.fulfill({ status: 503, json: { error: { code: 'SERVICE_UNAVAILABLE', message: 'x' } } }),
  );
  await page.getByRole('button', { name: 'Add book' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Nothing was changed');
  await expect(page).toHaveURL('/library/new');
});

test('pagination follows the API totals and keeps the search', async ({ page, baseURL }) => {
  test.slow();
  const word = uniqueWord('pager');
  for (let index = 0; index < 21; index += 1) {
    await libraryApi(page, baseURL!, 'POST', '/api/library/books', {
      title: `${word} ${String(index).padStart(2, '0')}`,
      format: 'ebook',
    });
  }
  await page.goto(`/library?q=${word}&sort=title_asc`);
  await expect(page.getByText('Page 1 of 2 · 21 books')).toBeVisible();
  await page.getByRole('link', { name: 'Next' }).click();
  await expect(page).toHaveURL(`/library?q=${word}&sort=title_asc&page=2`);
  await expect(page.getByRole('main').getByRole('listitem')).toHaveCount(1 + 4);
  await page.goto(`/library?q=${word}&page=9`);
  await expect(
    page.getByRole('heading', { name: 'There are no books on this page' }),
  ).toBeVisible();
  await page.goto(`/library?q=${word}&q=other&page=abc`);
  await expect(
    page
      .getByRole('heading', { name: 'Your library is empty' })
      .or(page.getByText(/books in your library/)),
  ).toBeVisible();
});

test('reader text is shown as text, never run', { tag: '@critical' }, async ({ page, baseURL }) => {
  let dialogs = 0;
  page.on('dialog', async (dialog) => {
    dialogs += 1;
    await dialog.dismiss();
  });
  const payload = '<img src=x onerror=alert(1)><script>alert(2)</script>';
  const book = await libraryApi<{ id: string }>(page, baseURL!, 'POST', '/api/library/books', {
    title: `${uniqueWord('Xss')} ${payload}`,
    description: payload,
    format: 'ebook',
    coverUrl: 'https://example.com/cover.jpg',
  });
  await page.goto(`/library/books/${book.id}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('<script>');
  await expect(page.locator('main img')).toHaveCount(0);
  const cover = page.getByRole('link', { name: /Cover image/ });
  await expect(cover).toHaveAttribute('rel', 'noopener noreferrer nofollow');
  await expect(cover).toHaveAttribute('href', 'https://example.com/cover.jpg');
  expect(dialogs).toBe(0);
});

test(
  'the confirmation dialog traps focus and Escape returns it',
  { tag: '@critical' },
  async ({ page }) => {
    const url = await addBook(page, { title: uniqueWord('Dialog') });
    await page.goto(url);
    const trigger = page.getByRole('button', { name: 'Delete book' });
    await trigger.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // The page behind a modal dialog is inert: Tab reaches only the dialog (and browser UI, which a
    // headless browser reports as <body>), never a control behind it.
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press('Tab');
      const focusIsSafe = await dialog.evaluate(
        (el) => el.contains(document.activeElement) || document.activeElement === document.body,
      );
      expect(focusIsSafe).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(page).toHaveURL(url);
  },
);

test('the picker reaches book 21 when the first 20 matches are already in a collection', async ({
  page,
  baseURL,
}) => {
  test.slow();
  const word = uniqueWord('many');
  const ids: string[] = [];
  for (let index = 0; index < 21; index += 1) {
    const book = await libraryApi<{ id: string }>(page, baseURL!, 'POST', '/api/library/books', {
      title: `${word} ${String(index).padStart(2, '0')}`,
      format: 'ebook',
    });
    ids.push(book.id);
  }
  // Newest first: the first page of matches is books 01–20, so book 00 is on page 2.
  const collection = await libraryApi<{ id: string }>(
    page,
    baseURL!,
    'POST',
    '/api/library/collections',
    {
      name: `Shelf ${word}`,
    },
  );
  for (const id of ids.slice(1)) {
    await libraryApi(
      page,
      baseURL!,
      'PUT',
      `/api/library/collections/${collection.id}/books/${id}`,
    );
  }

  await page.goto(`/library/collections/${collection.id}`);
  await page.getByLabel('Find a book to add').fill(word);
  await expect(
    page.getByText(
      'Showing 20 of 21 matching books. 20 shown so far are already in this collection.',
    ),
  ).toBeVisible();
  await expect(page.getByText(/no other books/i)).toHaveCount(0);
  await page.getByRole('button', { name: 'Load more books' }).click();
  await page.getByRole('button', { name: `Add ${word} 00` }).click();
  await expect(page.getByRole('status').filter({ hasText: `Added ${word} 00.` })).toBeVisible();
  await expect(page.getByText('Page 1 of 2 · 21 books')).toBeVisible();

  const wish = await libraryApi<{ id: string }>(page, baseURL!, 'POST', '/api/library/wishlist', {
    title: `Wanted ${word}`,
  });
  await page.goto(`/library/wishlist/${wish.id}`);
  await page.getByLabel('Find the book in your library').fill(word);
  await expect(page.getByText('Showing 20 of 21 matching books.')).toBeVisible();
  await page.getByRole('button', { name: 'Load more books' }).click();
  await page.getByRole('button', { name: `Choose ${word} 00` }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Mark acquired' }).click();
  await expect(page.getByRole('link', { name: `${word} 00` })).toBeVisible();
});

test('unlabelled copies added the same day keep distinct, stable names', async ({ page }) => {
  const url = await addBook(page, { title: uniqueWord('Twins') });
  await page.goto(url);
  for (let count = 0; count < 2; count += 1) {
    await page.getByRole('button', { name: 'Add a copy' }).click();
    await page.getByRole('button', { name: 'Add copy' }).click();
    await expect(page.getByRole('button', { name: /^Edit Unlabelled copy #/ })).toHaveCount(
      count + 1,
    );
  }
  const editNames = async () =>
    page
      .getByRole('button', { name: /^Edit Unlabelled copy #[0-9a-f]{6}$/ })
      .evaluateAll((buttons) =>
        buttons.map((button) => button.textContent?.replace(/^Edit\s*/, '').trim()),
      );
  const before = await editNames();
  expect(new Set(before).size).toBe(2);

  await page.getByRole('button', { name: 'Add a copy' }).click();
  await page.getByRole('button', { name: 'Add copy' }).click();
  await expect(page.getByRole('button', { name: /^Edit Unlabelled copy #/ })).toHaveCount(3);
  const after = await editNames();
  expect(new Set(after).size).toBe(3);
  for (const name of before) expect(after).toContain(name);

  await page
    .getByRole('button', { name: /^Delete copy/ })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toContainText(`Delete ${after[0]}?`);
});
