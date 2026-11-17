import { expect, libraryApi, test, uniqueWord } from './support/reader';
import { BROWSER_LEAK } from './support/leaks';

test('every library write refuses a foreign or missing origin', async ({ page, baseURL }) => {
  const book = await libraryApi<{ id: string }>(page, baseURL!, 'POST', '/api/library/books', {
    title: uniqueWord('Guarded'),
    format: 'physical',
  });
  const attempts: Array<[string, string, unknown?]> = [
    ['POST', '/api/library/books', { title: 'Forged', format: 'ebook' }],
    ['PATCH', `/api/library/books/${book.id}`, { title: 'Forged' }],
    ['DELETE', `/api/library/books/${book.id}`],
    ['POST', `/api/library/books/${book.id}/copies`, {}],
    ['POST', '/api/library/wishlist', { title: 'Forged' }],
  ];
  for (const [method, path, data] of attempts) {
    for (const origin of ['https://evil.example', 'null']) {
      const response = await page.request.fetch(path, {
        method,
        headers: { Origin: origin, 'X-Forwarded-Host': 'evil.example' },
        ...(data === undefined ? {} : { data }),
      });
      expect(response.status(), `${method} ${path} from ${origin}`).toBe(403);
    }
  }
  await page.goto(`/library/books/${book.id}`);
  await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('Forged');
  await expect(page.getByText('No copies recorded yet.')).toBeVisible();
});

test(
  'library reads and writes need a session, and never reveal foreign records',
  { tag: '@critical' },
  async ({ playwright, baseURL }) => {
    const anonymous = await playwright.request.newContext({
      baseURL: baseURL!,
      storageState: { cookies: [], origins: [] },
    });
    expect((await anonymous.get('/api/library/books')).status()).toBe(401);
    expect(
      (
        await anonymous.post('/api/library/books', {
          data: { title: 'x', format: 'ebook' },
          headers: { Origin: baseURL! },
        })
      ).status(),
    ).toBe(401);
    await anonymous.dispose();
  },
);

test('ids and queries are validated before the API is called', async ({ page, baseURL }) => {
  const badId = await page.request.fetch('/api/library/books/..%2F..%2Fusers', {
    method: 'PATCH',
    headers: { Origin: baseURL! },
    data: { title: 'x' },
  });
  expect([400, 404]).toContain(badId.status());
  expect((await page.request.get('/api/library/books?q=a&q=b')).status()).toBe(400);
  expect((await page.request.get('/api/library/books?ownerId=1')).status()).toBe(400);
  const foreign = await page.request.fetch('/api/library/books/0123456789abcdef01234567', {
    method: 'PATCH',
    headers: { Origin: baseURL! },
    data: { title: 'x' },
  });
  expect(foreign.status()).toBe(404);
  expect(await foreign.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Book not found' } });
});

test('no token or API address reaches the browser on library pages', async ({ page, baseURL }) => {
  const bodies: string[] = [];
  page.on('response', async (response) => {
    if (!response.url().startsWith(baseURL!)) return;
    try {
      bodies.push(await response.text());
    } catch {
      // Redirects have no body.
    }
  });
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));

  await page.goto('/library/new');
  await page.getByLabel('Title').fill(uniqueWord('Leakcheck'));
  await page.getByRole('button', { name: 'Add book' }).click();
  await expect(page).toHaveURL(/notice=book-created/);
  await page.goto('/library');
  await page.goto('/library/wishlist');

  expect(requests.filter((url) => !url.startsWith(baseURL!))).toEqual([]);
  const visible = [
    ...bodies,
    await page.content(),
    JSON.stringify(await page.context().cookies()),
  ].join('\n');
  expect(visible).not.toMatch(BROWSER_LEAK);
  const session = (await page.context().cookies()).find(
    (cookie) => cookie.name === 'avuneri_session_local',
  );
  expect(session?.httpOnly).toBe(true);
});

test('library responses are never cacheable', async ({ page, baseURL }) => {
  for (const path of ['/library', '/library/locations', '/library/wishlist']) {
    expect((await page.request.get(path)).headers()['cache-control']).toMatch(/no-store/);
  }
  expect((await page.request.get('/api/library/books')).headers()['cache-control']).toBe(
    'no-store',
  );
  const created = await page.request.post('/api/library/locations', {
    data: { name: uniqueWord('Cache') },
    headers: { Origin: baseURL! },
  });
  expect(created.headers()['cache-control']).toBe('no-store');
});
