import { expectNoHorizontalScroll } from './support/layout';
import { lendingPaths, seedLending } from './support/lending';
import { test } from './support/reader';
import { readingAndNotesPaths, seedReadingAndNotes } from './support/reading-notes';

/* Reading, notes, lending and Home pages hold their layout on small phones, at doubled text size and on tablets. */

test.describe('phone 320px', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone widths run in the mobile project');
  test.use({ viewport: { width: 320, height: 720 } });

  test('no reading or notes page scrolls sideways, also at 200% text', async ({
    page,
    baseURL,
  }) => {
    test.slow();
    const seeded = await seedReadingAndNotes(page, baseURL!);
    for (const path of readingAndNotesPaths(seeded)) {
      await page.goto(path);
      await expectNoHorizontalScroll(page, path);
      await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
      await expectNoHorizontalScroll(page, `${path} at 200%`);
    }
  });
});

for (const width of [768, 1024]) {
  test.describe(`tablet ${width}px`, () => {
    test.skip(({ isMobile }) => isMobile, 'wide layouts run in the desktop project');
    test.use({ viewport: { width, height: 900 } });

    test('reading and notes pages fit', async ({ page, baseURL }) => {
      const seeded = await seedReadingAndNotes(page, baseURL!);
      for (const path of readingAndNotesPaths(seeded)) {
        await page.goto(path);
        await expectNoHorizontalScroll(page, path);
      }
    });
  });
}

test.describe('lending and Home at 320px', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone widths run in the mobile project');
  test.use({ viewport: { width: 320, height: 720 } });

  test('no lending or Home page scrolls sideways, also at 200% text', async ({ page, baseURL }) => {
    test.slow();
    const seeded = await seedLending(page, baseURL!);
    for (const path of lendingPaths(seeded)) {
      await page.goto(path);
      await expectNoHorizontalScroll(page, path);
      await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
      await expectNoHorizontalScroll(page, `${path} at 200%`);
    }
  });
});

for (const width of [768, 1024]) {
  test.describe(`lending and Home at ${width}px`, () => {
    test.skip(({ isMobile }) => isMobile, 'wide layouts run in the desktop project');
    test.use({ viewport: { width, height: 900 } });

    test('lending and Home pages fit', async ({ page, baseURL }) => {
      const seeded = await seedLending(page, baseURL!);
      for (const path of lendingPaths(seeded)) {
        await page.goto(path);
        await expectNoHorizontalScroll(page, path);
      }
    });
  });
}
