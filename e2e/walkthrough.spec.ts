import type { Page } from '@playwright/test';
import { libraryApi, registerFreshReader, test, uniqueWord } from './support/reader';

/**
 * Captures the visual walkthrough into screenshots/ (git-ignored; uploaded by CI as an artifact).
 * Runs against the real API with real records. It asserts nothing beyond the pages loading.
 */
async function seed(page: Page, origin: string) {
  const word = uniqueWord('');
  const shelf = await libraryApi<{ id: string }>(page, origin, 'POST', '/api/library/locations', {
    name: 'Study Shelf',
  });
  const book = await libraryApi<{ id: string }>(page, origin, 'POST', '/api/library/books', {
    title: 'Middlemarch',
    authors: ['George Eliot'],
    format: 'physical',
    publicationYear: 1871,
    edition: 'Penguin Classics',
    description: 'A study of provincial life in the fictional Midlands town of Middlemarch.',
  });
  await libraryApi(page, origin, 'POST', '/api/library/books', {
    title: 'Dune',
    authors: ['Frank Herbert'],
    format: 'ebook',
  });
  await libraryApi(page, origin, 'POST', '/api/library/books', {
    title: 'Meditations',
    authors: ['Marcus Aurelius'],
    format: 'physical',
  });
  await libraryApi(page, origin, 'POST', `/api/library/books/${book.id}/copies`, {
    label: 'Signed hardback',
    condition: 'like_new',
    locationId: shelf.id,
  });
  await libraryApi(page, origin, 'POST', `/api/library/books/${book.id}/copies`, {
    condition: 'fair',
    storageNote: 'Spine worn',
  });
  const category = await libraryApi<{ id: string }>(
    page,
    origin,
    'POST',
    '/api/library/categories',
    { name: 'Fiction' },
  );
  const collection = await libraryApi<{ id: string }>(
    page,
    origin,
    'POST',
    '/api/library/collections',
    { name: 'To Read in 2027', description: 'Books for next year' },
  );
  await libraryApi(page, origin, 'PUT', `/api/library/categories/${category.id}/books/${book.id}`);
  await libraryApi(
    page,
    origin,
    'PUT',
    `/api/library/collections/${collection.id}/books/${book.id}`,
  );
  const wish = await libraryApi<{ id: string }>(page, origin, 'POST', '/api/library/wishlist', {
    title: 'Daniel Deronda',
    authors: ['George Eliot'],
    priority: 'high',
    sourceUrl: 'https://example.com/deronda',
    note: `Annotated edition ${word}`,
  });
  return { book: book.id, category: category.id, collection: collection.id, wish: wish.id };
}

const shots = [
  { name: 'mobile-390-library', width: 390, height: 844, scheme: 'light', path: () => '/library' },
  {
    name: 'mobile-390-book-dark',
    width: 390,
    height: 844,
    scheme: 'dark',
    path: (s: Ids) => `/library/books/${s.book}`,
  },
  {
    name: 'mobile-320-add-book',
    width: 320,
    height: 720,
    scheme: 'light',
    path: () => '/library/new',
  },
  {
    name: 'mobile-390-wishlist',
    width: 390,
    height: 844,
    scheme: 'light',
    path: () => '/library/wishlist',
  },
  {
    name: 'desktop-1440-library',
    width: 1440,
    height: 900,
    scheme: 'light',
    path: () => '/library',
  },
  {
    name: 'desktop-1440-book',
    width: 1440,
    height: 900,
    scheme: 'light',
    path: (s: Ids) => `/library/books/${s.book}`,
  },
  {
    name: 'desktop-1440-edit-book-dark',
    width: 1440,
    height: 900,
    scheme: 'dark',
    path: (s: Ids) => `/library/books/${s.book}/edit`,
  },
  {
    name: 'desktop-1440-locations',
    width: 1440,
    height: 900,
    scheme: 'light',
    path: () => '/library/locations',
  },
  {
    name: 'desktop-1440-categories',
    width: 1440,
    height: 900,
    scheme: 'light',
    path: () => '/library/categories',
  },
  {
    name: 'desktop-1440-collection',
    width: 1440,
    height: 900,
    scheme: 'dark',
    path: (s: Ids) => `/library/collections/${s.collection}`,
  },
  {
    name: 'desktop-1440-wish',
    width: 1440,
    height: 900,
    scheme: 'light',
    path: (s: Ids) => `/library/wishlist/${s.wish}`,
  },
  {
    name: 'desktop-1440-no-match',
    width: 1440,
    height: 900,
    scheme: 'light',
    path: () => '/library?q=nothingmatchesthis',
  },
] as const;
type Ids = Awaited<ReturnType<typeof seed>>;

test.describe('visual walkthrough', () => {
  test.skip(({ isMobile }) => isMobile, 'captured once, from the desktop project');

  test('library screens', async ({ page, baseURL }) => {
    test.slow();
    await registerFreshReader(page, baseURL!);
    await page.goto('/library');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: 'screenshots/desktop-1440-empty-library.png', fullPage: true });
    const ids = await seed(page, baseURL!);
    for (const shot of shots) {
      await page.setViewportSize({ width: shot.width, height: shot.height });
      await page.emulateMedia({ colorScheme: shot.scheme });
      await page.goto(shot.path(ids));
      await page.waitForLoadState('networkidle');
      // Phone shots capture the viewport, as a person sees it.
      await page.screenshot({ path: `screenshots/${shot.name}.png`, fullPage: shot.width >= 768 });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(`/library/books/${ids.book}`);
    await page.getByRole('button', { name: 'Delete book' }).click();
    await page.screenshot({ path: 'screenshots/desktop-1440-delete-confirm.png' });
  });
});
