import type { Page } from '@playwright/test';
import { expect, libraryApi, registerFreshReader, test, uniqueWord } from './support/reader';
import { BROWSER_LEAK } from './support/leaks';

/* Notes and highlights against the real API: safe display, search, privacy and long text. */

async function newBook(page: Page, origin: string) {
  const title = uniqueWord('Notes');
  const book = await libraryApi<{ id: string }>(page, origin, 'POST', '/api/library/books', {
    title,
    authors: ['George Eliot'],
    format: 'ebook',
  });
  return { id: book.id, title };
}

const HOSTILE = '<img src=x onerror="window.pwned=1"> [link](javascript:window.pwned=2)';

test(
  'a book-level note: formatting, hostile text kept inert, edit, whole-word and chapter search, confirmed delete',
  { tag: '@critical' },
  async ({ page, baseURL }) => {
    const book = await newBook(page, baseURL!);
    const word = uniqueWord('ardent');
    await page.goto(`/library/books/${book.id}`);
    const section = page.getByRole('region', { name: 'Notes and highlights' });
    await expect(section.getByText('No notes or highlights for this book yet.')).toBeVisible();
    await section.getByRole('link', { name: 'New note or highlight' }).click();

    await expect(page).toHaveURL(`/notes/new?bookId=${book.id}`);
    await expect(page.getByText(book.title, { exact: true })).toBeVisible();
    await page.getByRole('radio', { name: /^Note/ }).check();
    const source = `# ${word}\n\n${HOSTILE}\n\n*Bold* and _italic_, WhatsApp style\n- first point\n- second point`;
    await page.getByLabel('Your note').fill(source);
    await page.getByLabel('Chapter (optional)').fill('Chapter 3');
    await page.getByRole('button', { name: 'Save note' }).click();

    await expect(page).toHaveURL(/\/notes\/[0-9a-f]{24}\?notice=note-created$/);
    const notePath = new URL(page.url()).pathname;
    const main = page.getByRole('main');
    // Formatting is applied as elements; the hostile line stays visible text that never runs.
    await expect(main.getByText(word, { exact: true })).toHaveClass(/font-semibold/);
    await expect(main.locator('strong', { hasText: 'Bold' })).toBeVisible();
    await expect(main.locator('em', { hasText: 'italic' })).toBeVisible();
    await expect(main.getByRole('listitem').filter({ hasText: 'point' })).toHaveCount(2);
    await expect(main.getByText('<img src=x', { exact: false })).toBeVisible();
    await expect(main.locator('img, iframe, script, a[href^="javascript"]')).toHaveCount(0);
    expect(await page.evaluate(() => (window as { pwned?: number }).pwned)).toBeUndefined();

    await page.getByRole('link', { name: 'Edit note' }).click();
    await page.getByLabel('Title (optional)').fill(`Thoughts ${word}`);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page).toHaveURL(`${notePath}?notice=note-saved`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Thoughts ${word}`);

    await page.goto('/notes');
    await page.getByLabel('Search words').fill(word.toUpperCase());
    await page.getByLabel('Kind').selectOption('note');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page).toHaveURL(
      (url) =>
        url.searchParams.get('kind') === 'note' && url.searchParams.get('q') === word.toUpperCase(),
    );
    await expect(page.getByRole('link', { name: `Thoughts ${word}` })).toBeVisible();

    await page.getByLabel('Kind').selectOption('highlight');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByText('No notes match')).toBeVisible();

    await page.goto(`/notes?q=${word.slice(0, -2)}`); // a prefix is not a whole word
    await expect(page.getByText('No notes match')).toBeVisible();
    await page.goto(`/notes?chapter=${encodeURIComponent('  CHAPTER 3 ')}&bookId=${book.id}`);
    await expect(page.getByRole('link', { name: `Thoughts ${word}` })).toBeVisible();
    await expect(page.getByText(`Showing notes about ${book.title}.`)).toBeVisible();

    await page.goto(notePath);
    const remove = page.getByRole('button', { name: 'Delete note' });
    await remove.click();
    const dialog = page.getByRole('dialog', { name: 'Delete this note?' });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(remove).toBeFocused();
    await remove.click();
    await dialog.getByRole('button', { name: 'Delete note' }).click();
    await expect(page).toHaveURL('/notes?notice=note-deleted');
    await page.goto(notePath);
    await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible();
  },
);

test('a highlight linked to a reading, kept literal; the link is fixed to that book', async ({
  page,
  baseURL,
}) => {
  const book = await newBook(page, baseURL!);
  const other = await newBook(page, baseURL!);
  const session = await libraryApi<{ id: string }>(
    page,
    baseURL!,
    'POST',
    `/api/reading/books/${book.id}/sessions`,
    {},
  );
  await page.goto(`/reading/${session.id}`);
  await expect(page.getByText('No notes are linked to this reading yet.')).toBeVisible();
  await page.getByRole('link', { name: 'Add a note to this reading' }).click();
  await expect(page.getByLabel('Link to a reading (optional)')).toHaveValue(session.id);

  await page.getByRole('radio', { name: /^Highlight/ }).check();
  const quotation = '**Not bold**, she said —\n  “*Not italic* either.”';
  await page.getByLabel('Quotation').fill(quotation);
  await page.getByLabel('Page (optional)').fill('42');
  await page.getByRole('button', { name: 'Save highlight' }).click();
  await expect(page).toHaveURL(/notice=note-created/);
  await expect(page.getByRole('main').locator('blockquote')).toHaveText(quotation);
  await expect(page.getByRole('main').locator('strong, em')).toHaveCount(0);
  await expect(page.getByText('page 42')).toBeVisible();
  await expect(page.getByRole('link', { name: /Reading in progress/ })).toBeVisible();

  await page.goto(`/reading/${session.id}`);
  await expect(page.getByRole('region', { name: 'Notes from this reading' })).toContainText(
    'Not bold',
  );

  const mismatch = await page.request.post(`/api/notes/books/${other.id}`, {
    headers: { Origin: baseURL! },
    data: { kind: 'note', content: 'x', readingSessionId: session.id },
  });
  expect(mismatch.status()).toBe(409);
  expect((await mismatch.json()).error.code).toBe('READING_SESSION_BOOK_MISMATCH');
  const relink = await page.request.fetch(`/api/notes/${'0'.repeat(24)}`, {
    method: 'PATCH',
    headers: { Origin: baseURL! },
    data: { readingSessionId: session.id },
  });
  expect(relink.status()).toBe(400);

  await page.goto(`/notes?bookId=${book.id}&readingSessionId=${'f'.repeat(24)}`);
  await expect(page.getByText('That book or reading isn’t available')).toBeVisible();
  await page.goto(`/notes?bookId=not-an-id`);
  await expect(page.getByText('That book or reading isn’t available')).toBeVisible();
});

test(
  'a long note typed before the page is interactive survives hydration, and leaving asks first',
  { tag: '@critical' },
  async ({ page, baseURL }) => {
    const book = await newBook(page, baseURL!);
    let releaseScripts: () => void = () => {};
    const scriptsHeld = new Promise<void>((resolve) => (releaseScripts = resolve));
    // Scripts only: the server-rendered form (and its styles) are usable before hydration.
    await page.route('**/_next/static/chunks/**/*.js', async (route) => {
      await scriptsHeld;
      await route.continue();
    });
    await page.goto(`/notes/new?bookId=${book.id}`, { waitUntil: 'commit' });
    const content = page.locator('textarea[name="content"]');
    await content.waitFor();
    const paragraph = 'A long reflection, line after line.\n';
    const text = paragraph.repeat(400).trim(); // ~14,000 characters
    await page.locator('input[name="kind"][value="note"]').check();
    await content.fill(text);
    await content.pressSequentially(' Typed early.');
    releaseScripts();

    // Once interactive, the counter includes the early text, and typing continues from it.
    const counter = (count: number) =>
      page.getByText(`${count.toLocaleString('en')} of 20,000 characters`);
    await expect(counter(text.length + 13)).toBeVisible();
    await content.press('End');
    await content.pressSequentially('!');
    await expect(counter(text.length + 14)).toBeVisible();
    await expect(content).toHaveValue(`${text} Typed early.!`);

    await page.getByRole('navigation').getByRole('link', { name: 'Reading' }).first().click();
    const leave = page.getByRole('dialog', { name: 'Discard unsaved changes?' });
    await expect(leave).toBeVisible();
    await leave.getByRole('button', { name: 'Keep editing' }).click();
    await expect(page).toHaveURL(`/notes/new?bookId=${book.id}`);
    await expect(content).toHaveValue(`${text} Typed early.!`);

    await page.getByRole('button', { name: 'Save note' }).click();
    await expect(page).toHaveURL(/notice=note-created/);
    await expect(page.getByRole('main').getByText('Typed early.!', { exact: false })).toBeVisible();
  },
);

test('a 20,000-character note in multibyte text saves (past the 32 KiB library limit)', async ({
  page,
  baseURL,
}) => {
  const book = await newBook(page, baseURL!);
  const response = await page.request.post(`/api/notes/books/${book.id}`, {
    headers: { Origin: baseURL! },
    data: { kind: 'note', content: '€'.repeat(20_000) },
  });
  expect(response.status()).toBe(201);
  const tooLong = await page.request.post(`/api/notes/books/${book.id}`, {
    headers: { Origin: baseURL! },
    data: { kind: 'highlight', content: 'x'.repeat(5_001) },
  });
  expect(tooLong.status()).toBe(400);
});

test('reading and notes writes refuse foreign origins and anonymous callers', async ({
  page,
  playwright,
  baseURL,
}) => {
  const book = await newBook(page, baseURL!);
  const attempts: Array<[string, string, unknown?]> = [
    ['POST', `/api/reading/books/${book.id}/sessions`, {}],
    ['PATCH', `/api/reading/sessions/${'0'.repeat(24)}`, { rating: 1 }],
    ['POST', `/api/notes/books/${book.id}`, { kind: 'note', content: 'Forged' }],
    ['PATCH', `/api/notes/${'0'.repeat(24)}`, { title: 'Forged' }],
    ['DELETE', `/api/notes/${'0'.repeat(24)}`],
  ];
  for (const [method, path, data] of attempts) {
    const response = await page.request.fetch(path, {
      method,
      headers: { Origin: 'https://evil.example' },
      ...(data === undefined ? {} : { data }),
    });
    expect(response.status(), `${method} ${path}`).toBe(403);
  }
  const anonymous = await playwright.request.newContext({
    baseURL: baseURL!,
    storageState: { cookies: [], origins: [] },
  });
  for (const [method, path, data] of attempts) {
    const response = await anonymous.fetch(path, {
      method,
      headers: { Origin: baseURL! },
      ...(data === undefined ? {} : { data }),
    });
    expect(response.status(), `${method} ${path}`).toBe(401);
  }
  expect((await anonymous.get(`/api/reading/books/${book.id}/sessions`)).status()).toBe(401);
  await anonymous.dispose();
  await page.goto(`/library/books/${book.id}`);
  await expect(page.getByText('No notes or highlights for this book yet.')).toBeVisible();
  await expect(page.getByText('0 readings · 0 finished')).toBeVisible();
});

test('private: no tokens or API calls in the browser, and nothing visible to another reader', async ({
  page,
  baseURL,
}) => {
  const book = await newBook(page, baseURL!);
  const secret = uniqueWord('secret');
  const session = await libraryApi<{ id: string }>(
    page,
    baseURL!,
    'POST',
    `/api/reading/books/${book.id}/sessions`,
    { summary: secret },
  );
  const note = await libraryApi<{ id: string }>(
    page,
    baseURL!,
    'POST',
    `/api/notes/books/${book.id}`,
    {
      kind: 'note',
      content: `Private ${secret}`,
      readingSessionId: session.id,
    },
  );

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
    '/reading',
    '/notes',
    `/reading/${session.id}`,
    `/notes/${note.id}`,
    `/notes/${note.id}/edit`,
  ]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
  expect(requests.filter((url) => !url.startsWith(baseURL!))).toEqual([]);
  const visible = [...bodies, JSON.stringify(await page.context().cookies())].join('\n');
  expect(visible).not.toMatch(BROWSER_LEAK);
  for (const path of ['/reading', '/notes']) {
    expect((await page.request.get(path)).headers()['cache-control']).toMatch(/no-store/);
  }

  // A different reader: every id is simply "not found", with none of the content.
  await registerFreshReader(page, baseURL!);
  for (const path of [`/notes/${note.id}`, `/notes/${note.id}/edit`, `/reading/${session.id}`]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible();
    await expect(page.getByText(secret)).toHaveCount(0);
  }
  const foreign = await page.request.fetch(`/api/notes/${note.id}`, {
    method: 'PATCH',
    headers: { Origin: baseURL! },
    data: { title: 'Mine now' },
  });
  expect(foreign.status()).toBe(404);
  expect(await foreign.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Note not found' } });
  await page.goto(`/notes?bookId=${book.id}`);
  await expect(page.getByText('That book or reading isn’t available')).toBeVisible();

  // And the new reader's own empty states are honest.
  await page.goto('/notes');
  await expect(page.getByRole('heading', { name: 'No notes yet' })).toBeVisible();
  await page.goto('/reading');
  await expect(page.getByRole('heading', { name: 'No readings yet' })).toBeVisible();
});
