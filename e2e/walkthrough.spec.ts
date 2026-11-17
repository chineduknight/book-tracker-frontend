import type { Page } from '@playwright/test';
import { libraryApi, registerFreshReader, test, uniqueWord } from './support/reader';
import { seedLending, type SeededLending } from './support/lending';
import { seedReadingAndNotes, type SeededReading } from './support/reading-notes';

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

const readingShots = [
  { name: 'rn-mobile-390-reading-history', width: 390, scheme: 'light', path: () => '/reading' },
  {
    name: 'rn-mobile-390-reading-active-dark',
    width: 390,
    scheme: 'dark',
    path: (s: SeededReading) => `/reading/${s.activeSessionId}`,
  },
  {
    name: 'rn-mobile-320-start-reading',
    width: 320,
    scheme: 'light',
    path: (s: SeededReading) => `/reading/new?bookId=${s.bookId}`,
  },
  { name: 'rn-mobile-390-notes-dark', width: 390, scheme: 'dark', path: () => '/notes' },
  {
    name: 'rn-mobile-390-highlight',
    width: 390,
    scheme: 'light',
    path: (s: SeededReading) => `/notes/${s.highlightId}`,
  },
  { name: 'rn-desktop-1440-reading-history', width: 1440, scheme: 'light', path: () => '/reading' },
  {
    name: 'rn-desktop-1440-reading-finished-dark',
    width: 1440,
    scheme: 'dark',
    path: (s: SeededReading) => `/reading/${s.finishedSessionId}`,
  },
  {
    name: 'rn-desktop-1440-book-reading-and-notes',
    width: 1440,
    scheme: 'light',
    path: (s: SeededReading) => `/library/books/${s.bookId}`,
  },
  { name: 'rn-desktop-1440-notes', width: 1440, scheme: 'light', path: () => '/notes' },
  {
    name: 'rn-desktop-1440-note-markdown-dark',
    width: 1440,
    scheme: 'dark',
    path: (s: SeededReading) => `/notes/${s.noteId}`,
  },
  {
    name: 'rn-desktop-1440-new-highlight-for-reading',
    width: 1440,
    scheme: 'light',
    path: (s: SeededReading) =>
      `/notes/new?bookId=${s.bookId}&readingSessionId=${s.activeSessionId}`,
  },
] as const;

test.describe('visual walkthrough: reading and notes', () => {
  test.skip(({ isMobile }) => isMobile, 'captured once, from the desktop project');

  test('reading and notes screens', async ({ page, baseURL }) => {
    test.slow();
    await registerFreshReader(page, baseURL!);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/reading');
    await page.screenshot({
      path: 'screenshots/rn-desktop-1440-reading-empty.png',
      fullPage: true,
    });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/notes');
    await page.screenshot({ path: 'screenshots/rn-desktop-1440-notes-empty-dark.png' });

    const seeded = await seedReadingAndNotes(page, baseURL!);
    for (const shot of readingShots) {
      await page.setViewportSize({ width: shot.width, height: shot.width >= 768 ? 900 : 844 });
      await page.emulateMedia({ colorScheme: shot.scheme });
      await page.goto(shot.path(seeded));
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: `screenshots/${shot.name}.png`, fullPage: shot.width >= 768 });
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(`/reading/${seeded.activeSessionId}`);
    await page.getByLabel('Amount').fill('900');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await page.getByText('This book has 880 pages; enter at most 880.').waitFor();
    await page.screenshot({ path: 'screenshots/rn-desktop-1440-progress-validation.png' });
    await page.goto(`/reading/${seeded.activeSessionId}`);
    await page.getByRole('button', { name: 'Mark as finished…' }).click();
    await page.screenshot({ path: 'screenshots/rn-desktop-1440-finish-dialog.png' });

    await page.goto(`/notes/${seeded.noteId}`);
    await page.getByRole('button', { name: 'Delete note' }).click();
    await page.screenshot({ path: 'screenshots/rn-desktop-1440-delete-note-dialog.png' });
  });
});

const lendingShots = [
  { name: 'ld-mobile-390-home', width: 390, scheme: 'light', path: () => '/' },
  { name: 'ld-desktop-1440-home', width: 1440, scheme: 'light', path: () => '/' },
  { name: 'ld-desktop-1440-home-dark', width: 1440, scheme: 'dark', path: () => '/' },
  { name: 'ld-mobile-390-lending-active', width: 390, scheme: 'light', path: () => '/lending' },
  {
    name: 'ld-desktop-1440-lending-overdue-dark',
    width: 1440,
    scheme: 'dark',
    path: () => '/lending?status=overdue',
  },
  {
    name: 'ld-desktop-1440-lending-returned',
    width: 1440,
    scheme: 'light',
    path: () => '/lending?status=returned',
  },
  {
    name: 'ld-desktop-1440-choose-copy',
    width: 1440,
    scheme: 'light',
    path: (s: SeededLending) => `/lending/new?bookId=${s.bookId}`,
  },
  {
    name: 'ld-mobile-320-new-loan',
    width: 320,
    scheme: 'light',
    path: (s: SeededLending) => `/lending/new?copyId=${s.copyIds[2]}`,
  },
  {
    name: 'ld-desktop-1440-loan-overdue',
    width: 1440,
    scheme: 'light',
    path: (s: SeededLending) => `/lending/${s.overdueLoanId}`,
  },
  {
    name: 'ld-mobile-390-loan-returned-dark',
    width: 390,
    scheme: 'dark',
    path: (s: SeededLending) => `/lending/${s.returnedLoanId}`,
  },
  {
    name: 'ld-desktop-1440-copy-loans',
    width: 1440,
    scheme: 'light',
    path: (s: SeededLending) => `/lending/copies/${s.copyIds[2]}`,
  },
] as const;

test.describe('visual walkthrough: lending and Home', () => {
  test.skip(({ isMobile }) => isMobile, 'captured once, from the desktop project');

  test('lending and Home screens', async ({ page, baseURL }) => {
    test.slow();
    await registerFreshReader(page, baseURL!);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.screenshot({ path: 'screenshots/ld-desktop-1440-home-empty.png', fullPage: true });
    await page.goto('/lending');
    await page.screenshot({ path: 'screenshots/ld-desktop-1440-lending-empty.png' });

    const seeded = await seedLending(page, baseURL!);
    await seedReadingAndNotes(page, baseURL!);
    for (const shot of lendingShots) {
      await page.setViewportSize({ width: shot.width, height: shot.width >= 768 ? 900 : 844 });
      await page.emulateMedia({ colorScheme: shot.scheme });
      await page.goto(shot.path(seeded));
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: `screenshots/${shot.name}.png`, fullPage: shot.width >= 768 });
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(`/lending/new?copyId=${seeded.copyIds[2]}`);
    await page.getByLabel('Due back (optional)').fill('2020-01-01');
    await page.getByRole('button', { name: 'Record loan' }).click();
    await page.getByText('Enter who is borrowing the copy.').waitFor();
    await page.screenshot({ path: 'screenshots/ld-desktop-1440-new-loan-errors.png' });

    await page.goto(`/lending/${seeded.activeLoanId}`);
    await page.getByRole('button', { name: 'Mark returned…' }).click();
    await page.screenshot({ path: 'screenshots/ld-desktop-1440-return-dialog.png' });

    await page.goto(`/library/books/${seeded.bookId}`);
    // Each button is replaced by its result once checked.
    const checks = page.getByRole('button', { name: /^Check loan status of/ });
    for (const name of await checks.evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute('aria-label') ?? ''),
    )) {
      const check = page.getByRole('button', { name, exact: true });
      await check.click();
      await check.waitFor({ state: 'detached' });
    }
    await page
      .getByText(/On loan to/)
      .first()
      .waitFor();
    await page.screenshot({
      path: 'screenshots/ld-desktop-1440-copy-loan-state.png',
      fullPage: true,
    });

    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/lending?status=all');
    await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
    await page.screenshot({ path: 'screenshots/ld-mobile-320-lending-200pct.png' });
    await page.goto('/');
    await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
    await page.screenshot({ path: 'screenshots/ld-mobile-320-home-200pct.png' });
  });
});

/** FE #20: the shell and critical screens at small widths and large text, and the fixed states. */
test.describe('visual walkthrough: launch-readiness fixes', () => {
  test.skip(({ isMobile }) => isMobile, 'captured once, from the desktop project');

  test('shell, dialogs and corrected states', async ({ page, baseURL }) => {
    test.slow();
    const reading = await seedReadingAndNotes(page, baseURL!);
    const lending = await seedLending(page, baseURL!);
    const big = async () => {
      await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
    };
    const shot = (name: string, fullPage = false) =>
      page.screenshot({ path: `screenshots/qa-${name}.png`, fullPage });

    const phones: [number, string, string, 'light' | 'dark'][] = [
      [320, '/', 'home', 'light'],
      [320, '/library', 'library', 'dark'],
      [360, '/reading', 'reading', 'light'],
      [390, '/lending?status=all', 'lending', 'dark'],
    ];
    for (const [width, path, name, scheme] of phones) {
      await page.setViewportSize({ width, height: 740 });
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(path);
      await big();
      await shot(`mobile-${width}-${name}-200pct-${scheme}`);
    }

    await page.emulateMedia({ colorScheme: 'light' });
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto('/');
    await big();
    await page
      .getByRole('banner')
      .getByRole('button', { name: /^Account:/ })
      .click();
    await shot('mobile-320-account-menu-200pct');

    await page.goto(`/reading/${reading.activeSessionId}`);
    await big();
    await page.getByRole('button', { name: 'Mark as finished…' }).click();
    await shot('mobile-320-finish-dialog-200pct');
    await page.goto(`/lending/${lending.activeLoanId}`);
    await big();
    await page.getByRole('button', { name: 'Mark returned…' }).click();
    await shot('mobile-320-return-dialog-200pct');
    await page.goto(`/notes/new?bookId=${reading.bookId}`);
    await big();
    await page.getByLabel('Your note').fill('A long draft. '.repeat(1400));
    await shot('mobile-320-note-editor-200pct');

    await page.setViewportSize({ width: 740, height: 360 });
    await page.goto('/library');
    await big();
    await shot('landscape-740x360-library-200pct');
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto('/library');
    await big();
    await shot('tablet-768-library-200pct', true);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/lending?status=overdue&asOf=2027-02-29');
    await shot('mobile-390-overdue-rejected-day');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/lending?status=overdue&asOf=2027-02-29');
    await shot('desktop-1440-overdue-rejected-day');
    await page.goto('/');
    await shot('desktop-1440-home-tiles');
  });
});
