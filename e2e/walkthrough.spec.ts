import { test } from '@playwright/test';
import { registerViaApi } from './support/session';

/**
 * Captures the visual walkthrough for review into screenshots/ (git-ignored; uploaded by CI as an
 * artifact). It asserts nothing beyond the pages loading.
 */
const shots = [
  {
    name: 'mobile-320-login',
    width: 320,
    height: 720,
    path: '/login',
    scheme: 'light',
    signedIn: false,
  },
  {
    name: 'mobile-390-register',
    width: 390,
    height: 844,
    path: '/register',
    scheme: 'light',
    signedIn: false,
  },
  { name: 'mobile-390-home', width: 390, height: 844, path: '/', scheme: 'light', signedIn: true },
  {
    name: 'mobile-390-library-dark',
    width: 390,
    height: 844,
    path: '/library',
    scheme: 'dark',
    signedIn: true,
  },
  {
    name: 'tablet-768-library',
    width: 768,
    height: 1024,
    path: '/library',
    scheme: 'light',
    signedIn: true,
  },
  {
    name: 'desktop-1440-login',
    width: 1440,
    height: 900,
    path: '/login',
    scheme: 'light',
    signedIn: false,
  },
  {
    name: 'desktop-1440-home-account-menu',
    width: 1440,
    height: 900,
    path: '/',
    scheme: 'light',
    signedIn: true,
    openMenu: true,
  },
  {
    name: 'desktop-1440-register-dark',
    width: 1440,
    height: 900,
    path: '/register',
    scheme: 'dark',
    signedIn: false,
  },
] as const;

test.describe('visual walkthrough', () => {
  test.skip(({ isMobile }) => isMobile, 'captured once, from the desktop project');

  for (const shot of shots) {
    test(shot.name, async ({ page }) => {
      await page.setViewportSize({ width: shot.width, height: shot.height });
      await page.emulateMedia({ colorScheme: shot.scheme });
      if (shot.signedIn) await registerViaApi(page, { name: 'Ada Lovelace' });
      await page.goto(shot.path);
      if ('openMenu' in shot) await page.getByRole('button', { name: /^Account:/ }).click();
      // Phone shots capture the viewport, as a person sees it: a full-page capture would paint the
      // fixed bottom bar in the middle of the page.
      await page.screenshot({ path: `screenshots/${shot.name}.png`, fullPage: shot.width >= 768 });
    });
  }
});
