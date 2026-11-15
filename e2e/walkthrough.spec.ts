import { test } from '@playwright/test';

/**
 * Captures the visual walkthrough for review into screenshots/ (git-ignored; uploaded by CI as an
 * artifact). It asserts nothing beyond the pages loading.
 */
const shots = [
  { name: 'mobile-320-home', width: 320, height: 720, path: '/', scheme: 'light' },
  { name: 'mobile-390-home', width: 390, height: 844, path: '/', scheme: 'light' },
  { name: 'mobile-390-library', width: 390, height: 844, path: '/library', scheme: 'light' },
  { name: 'mobile-390-reading-dark', width: 390, height: 844, path: '/reading', scheme: 'dark' },
  { name: 'tablet-768-library', width: 768, height: 1024, path: '/library', scheme: 'light' },
  { name: 'desktop-1440-home', width: 1440, height: 900, path: '/', scheme: 'light' },
  { name: 'desktop-1440-library', width: 1440, height: 900, path: '/library', scheme: 'light' },
  { name: 'desktop-1440-library-dark', width: 1440, height: 900, path: '/library', scheme: 'dark' },
] as const;

test.describe('visual walkthrough', () => {
  test.skip(({ isMobile }) => isMobile, 'captured once, from the desktop project');

  for (const shot of shots) {
    test(shot.name, async ({ page }) => {
      await page.setViewportSize({ width: shot.width, height: shot.height });
      await page.emulateMedia({ colorScheme: shot.scheme });
      await page.goto(shot.path);
      // Phone shots capture the viewport, as a person sees it: a full-page capture would paint the
      // fixed bottom bar in the middle of the page.
      await page.screenshot({ path: `screenshots/${shot.name}.png`, fullPage: shot.width >= 768 });
    });
  }
});
