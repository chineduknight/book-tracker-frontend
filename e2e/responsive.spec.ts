import type { Page } from '@playwright/test';
import { navLabels, pages } from './routes';
import { expectNoHorizontalScroll } from './support/layout';
import { expect, test } from './support/reader';

const phoneWidths = [320, 390];
const wideWidths = [768, 1024, 1440];

function primaryNav(page: Page) {
  return page.getByRole('navigation', { name: 'Primary' });
}

for (const width of phoneWidths) {
  test.describe(`phone ${width}px`, () => {
    test.skip(({ isMobile }) => !isMobile, 'phone widths run in the mobile project');
    test.use({ viewport: { width, height: 740 } });

    test('no page scrolls horizontally', async ({ page }) => {
      for (const { path } of pages) {
        await page.goto(path);
        await expectNoHorizontalScroll(page);
      }
    });

    test('the bottom bar shows five whole labels with comfortable targets', async ({ page }) => {
      await page.goto('/');
      const nav = primaryNav(page);
      const navBox = await nav.boundingBox();
      expect(navBox).not.toBeNull();
      expect(Math.round(navBox!.y + navBox!.height)).toBe(740);

      const links = nav.getByRole('link');
      await expect(links).toHaveText(navLabels);
      for (const link of await links.all()) {
        await expect(link).toBeVisible();
        const box = (await link.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
        const clipped = await link.evaluate((el) => {
          const label = el.querySelector('span:last-child') as HTMLElement;
          return label.scrollWidth > label.clientWidth + 1;
        });
        expect(clipped).toBe(false);
      }
    });

    test('the last content is never hidden behind the bottom bar', async ({ page }) => {
      for (const path of ['/', '/library']) {
        await page.goto(path);
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        const lastBottom = await page
          .locator('#main-content > :last-child')
          .evaluate((el) => el.getBoundingClientRect().bottom);
        const navTop = (await primaryNav(page).boundingBox())!.y;
        expect(lastBottom).toBeLessThanOrEqual(navTop);
      }
    });

    test('doubled text size and a very long title do not break the layout', async ({ page }) => {
      await page.goto('/library');
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '200%';
        document.querySelector('h1')!.textContent =
          'Anunusuallylongtitlewithoutanyspacesthatmustwrapratherthanoverflow and more words';
      });
      await expectNoHorizontalScroll(page);
      for (const link of await primaryNav(page).getByRole('link').all()) {
        await expect(link).toBeVisible();
      }
    });
  });
}

for (const width of wideWidths) {
  test.describe(`wide ${width}px`, () => {
    test.skip(({ isMobile }) => isMobile, 'wide widths run in the desktop project');
    test.use({ viewport: { width, height: 900 } });

    test('the sidebar replaces the bottom bar and main keeps a readable width', async ({
      page,
    }) => {
      for (const path of ['/', '/library', '/library/wishlist']) {
        await page.goto(path);
        await expectNoHorizontalScroll(page);

        const navBox = (await primaryNav(page).boundingBox())!;
        expect(navBox.x).toBe(0);
        expect(navBox.width).toBeLessThanOrEqual(256);
        expect(navBox.height).toBeGreaterThan(400);
        // A sidebar, not a bottom bar: it starts under the header, not at the bottom edge.
        expect(navBox.y).toBeLessThan(100);

        const mainBox = (await page.getByRole('main').boundingBox())!;
        expect(mainBox.x).toBeGreaterThanOrEqual(navBox.x + navBox.width);
        expect(mainBox.width).toBeLessThanOrEqual(896);
      }
    });

    test('the sidebar stays put while the page scrolls', async ({ page }) => {
      await page.setViewportSize({ width, height: 420 });
      await page.goto('/library');
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await expect(primaryNav(page).getByRole('link', { name: 'Home' })).toBeInViewport();
    });
  });
}
