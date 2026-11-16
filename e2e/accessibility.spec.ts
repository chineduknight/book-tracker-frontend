import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { pages, publicPages } from './routes';
import { expect, libraryApi, test, uniqueWord } from './support/reader';
import { lendingPaths, seedLending } from './support/lending';
import { readingAndNotesPaths, seedReadingAndNotes } from './support/reading-notes';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const summary = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    targets: v.nodes.map((n) => n.target.join(' ')),
  }));
  expect(summary).toEqual([]);
}

interface Seeded {
  bookId: string;
  ebookId: string;
  categoryId: string;
  collectionId: string;
  wishId: string;
}

/** Real records in the reader's library, created through the BFF. */
async function seedLibrary(page: Page, origin: string): Promise<Seeded> {
  const word = uniqueWord('axe');
  const book = await libraryApi<{ id: string }>(page, origin, 'POST', '/api/library/books', {
    title: `Middlemarch ${word}`,
    authors: ['George Eliot'],
    format: 'physical',
    description: 'A study of provincial life.',
  });
  const ebook = await libraryApi<{ id: string }>(page, origin, 'POST', '/api/library/books', {
    title: `Dune ${word}`,
    format: 'ebook',
  });
  const location = await libraryApi<{ id: string }>(
    page,
    origin,
    'POST',
    '/api/library/locations',
    {
      name: `Shelf ${word}`,
    },
  );
  await libraryApi(page, origin, 'POST', `/api/library/books/${book.id}/copies`, {
    label: 'Signed',
    condition: 'good',
    locationId: location.id,
  });
  const category = await libraryApi<{ id: string }>(
    page,
    origin,
    'POST',
    '/api/library/categories',
    {
      name: `Fiction ${word}`,
    },
  );
  const collection = await libraryApi<{ id: string }>(
    page,
    origin,
    'POST',
    '/api/library/collections',
    {
      name: `Shelf list ${word}`,
    },
  );
  await libraryApi(page, origin, 'PUT', `/api/library/categories/${category.id}/books/${book.id}`);
  const wish = await libraryApi<{ id: string }>(page, origin, 'POST', '/api/library/wishlist', {
    title: `Wanted ${word}`,
    sourceUrl: 'https://example.com/wanted',
  });
  return {
    bookId: book.id,
    ebookId: ebook.id,
    categoryId: category.id,
    collectionId: collection.id,
    wishId: wish.id,
  };
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} theme`, () => {
    test.use({ colorScheme });

    test.describe('signed in', () => {
      for (const { path } of pages) {
        test(`${path} has no automated accessibility violations`, async ({ page }) => {
          await page.goto(path);
          await expectNoViolations(page);
        });
      }

      test('library records, forms and dialogs have no violations', async ({ page, baseURL }) => {
        const seeded = await seedLibrary(page, baseURL!);
        for (const path of [
          `/library/books/${seeded.bookId}`,
          `/library/books/${seeded.ebookId}`,
          `/library/books/${seeded.bookId}/edit`,
          '/library/new',
          `/library/categories/${seeded.categoryId}`,
          `/library/collections/${seeded.collectionId}`,
          `/library/wishlist/${seeded.wishId}`,
          '/library/wishlist/new',
          '/library/wishlist?status=all',
          '/library?q=nothingmatchesthisword',
          '/library/books/000000000000000000000000',
        ]) {
          await page.goto(path);
          await expectNoViolations(page);
        }

        await page.goto(`/library/books/${seeded.bookId}`);
        await page.getByRole('button', { name: 'Add a copy' }).click();
        await expectNoViolations(page);
        await page.getByRole('button', { name: 'Delete book' }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await expectNoViolations(page);

        await page.goto('/library/new');
        await page.getByRole('button', { name: 'Add book' }).click();
        await expect(page.getByLabel('Title')).toHaveAttribute('aria-invalid', 'true');
        await expectNoViolations(page);
      });

      test('reading and notes pages, forms, errors and dialogs have no violations', async ({
        page,
        baseURL,
      }) => {
        test.slow();
        const seeded = await seedReadingAndNotes(page, baseURL!);
        for (const path of readingAndNotesPaths(seeded)) {
          await page.goto(path);
          await expectNoViolations(page);
        }

        await page.goto(`/reading/${seeded.activeSessionId}`);
        await page.getByLabel('Amount').fill('99999');
        await page.getByRole('button', { name: 'Save changes' }).click();
        await expect(page.getByLabel('Amount')).toHaveAttribute('aria-invalid', 'true');
        await expectNoViolations(page);
        await page.getByRole('button', { name: 'Mark as finished…' }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await expectNoViolations(page);

        await page.goto(`/notes/new?bookId=${seeded.bookId}`);
        await page.getByRole('button', { name: 'Save note' }).click();
        await expect(page.getByText('Choose note or highlight.')).toBeVisible();
        await expectNoViolations(page);
        await page.getByLabel('Your note').fill('Unsaved words');
        await page.getByRole('link', { name: 'Cancel' }).click();
        await expect(page.getByRole('dialog', { name: 'Discard unsaved changes?' })).toBeVisible();
        await expectNoViolations(page);

        await page.goto(`/notes/${seeded.highlightId}`);
        await page.getByRole('button', { name: 'Delete highlight' }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await expectNoViolations(page);
      });

      test('lending, Home, loan forms, errors and dialogs have no violations', async ({
        page,
        baseURL,
      }) => {
        test.slow();
        const seeded = await seedLending(page, baseURL!);
        for (const path of lendingPaths(seeded)) {
          await page.goto(path);
          await expectNoViolations(page);
        }

        await page.goto(`/lending/new?copyId=${seeded.copyIds[2]}`);
        await page.getByRole('button', { name: 'Record loan' }).click();
        await expect(page.getByLabel('Borrower')).toHaveAttribute('aria-invalid', 'true');
        await expectNoViolations(page);

        await page.goto(`/lending/${seeded.overdueLoanId}`);
        await page.getByRole('button', { name: 'Mark returned…' }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Mark returned' }).click();
        await expect(
          page.getByRole('dialog').getByText('Enter the day it came back.'),
        ).toBeVisible();
        await expectNoViolations(page);

        await page.goto(`/library/books/${seeded.bookId}`);
        await page.getByRole('button', { name: /^Check loan status of Paperback/ }).click();
        await expect(page.getByText(/On loan to/)).toBeVisible();
        await expectNoViolations(page);
      });

      test('the open account menu has no violations', async ({ page }) => {
        await page.goto('/');
        await page.getByRole('button', { name: /^Account:/ }).click();
        await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
        await expectNoViolations(page);
      });
    });

    test.describe('signed out', () => {
      test.use({ storageState: { cookies: [], origins: [] } });

      for (const { path } of [...publicPages, { path: '/no-such-page' }]) {
        test(`${path} has no automated accessibility violations`, async ({ page }) => {
          await page.goto(path);
          await expectNoViolations(page);
        });
      }

      test('sign-in errors have no violations', async ({ page }) => {
        await page.goto('/login');
        await page.getByRole('button', { name: 'Sign in' }).click();
        await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');
        await expectNoViolations(page);
      });
    });
  });
}

test.describe('themes', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('follows the system light preference', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/login');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(246, 243, 236)');
  });

  test('follows the system dark preference', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/login');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(20, 19, 17)');
    await expect(page.locator('body')).toHaveCSS('color', 'rgb(237, 231, 220)');
  });
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('transitions and animations are effectively disabled', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Account:/ }).click();
    const durations = await page.evaluate(() =>
      [...document.querySelectorAll('*')].flatMap((el) => {
        const style = getComputedStyle(el);
        return [...style.transitionDuration.split(','), ...style.animationDuration.split(',')].map(
          (d) => parseFloat(d) * (d.trim().endsWith('ms') ? 0.001 : 1),
        );
      }),
    );
    expect(Math.max(...durations)).toBeLessThanOrEqual(0.001);
  });
});
