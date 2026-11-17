import type { Locator, Page } from '@playwright/test';
import { navLabels } from './routes';
import {
  expectNoHorizontalScroll,
  expectNoLayoutProblems,
  expectWholeWords,
  setTextSize,
} from './support/layout';
import { seedLending } from './support/lending';
import { expect, test } from './support/reader';
import { seedReadingAndNotes } from './support/reading-notes';

/*
 * The FE #19 screenshots showed that at 320px and 200% text the account avatar covered the
 * wordmark and the bottom-bar labels broke mid-word ("Libra / ry"), although nothing scrolled
 * sideways. These checks look for overlap, clipping and split words directly, at several widths
 * and text sizes, rather than relying on the absence of a horizontal scrollbar.
 */

const destinations = ['/', '/library', '/reading', '/notes', '/lending'];
const textSizes = [100, 150, 200];

function primaryNav(page: Page) {
  return page.getByRole('navigation', { name: 'Primary' });
}

function header(page: Page) {
  return page.getByRole('banner');
}

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box, 'element has a box').not.toBeNull();
  return box!;
}

function intersects(a: { x: number; y: number; width: number; height: number }, b: typeof a) {
  return (
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1 &&
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1
  );
}

/** The header and bottom bar are whole, separate, readable and comfortably tappable. */
async function expectShellUsable(page: Page, context: string) {
  const viewport = page.viewportSize()!;
  const home = header(page).getByRole('link', { name: 'Avuneri' });
  const account = header(page).getByRole('button', { name: /^Account:/ });
  const homeBox = await boxOf(home);
  const accountBox = await boxOf(account);
  expect(intersects(homeBox, accountBox), `${context}: wordmark and account overlap`).toBe(false);
  for (const box of [homeBox, accountBox]) {
    expect(box.x, context).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, context).toBeLessThanOrEqual(viewport.width);
    expect(box.width, `${context}: header target width`).toBeGreaterThanOrEqual(44);
    expect(box.height, `${context}: header target height`).toBeGreaterThanOrEqual(44);
  }

  const nav = primaryNav(page);
  const links = nav.getByRole('link');
  await expect(links).toHaveText(navLabels);
  await expect(nav.locator('a[aria-current="page"]')).toHaveCount(1);
  const navBox = await boxOf(nav);
  if (viewport.width < 768) {
    expect(Math.round(navBox.y + navBox.height), `${context}: bar sits on the bottom edge`).toBe(
      viewport.height,
    );
  }
  const boxes = [];
  for (const link of await links.all()) {
    const box = await boxOf(link);
    expect(box.width, `${context}: tab width`).toBeGreaterThanOrEqual(44);
    expect(box.height, `${context}: tab height`).toBeGreaterThanOrEqual(44);
    const label = await boxOf(link.locator('[data-slot="nav-label"]'));
    expect(label.x, `${context}: label inside its tab`).toBeGreaterThanOrEqual(box.x - 1);
    expect(label.x + label.width, `${context}: label inside its tab`).toBeLessThanOrEqual(
      box.x + box.width + 1,
    );
    boxes.push(box);
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      expect(intersects(boxes[i]!, boxes[j]!), `${context}: tabs ${i} and ${j} overlap`).toBe(
        false,
      );
    }
  }
  await expectWholeWords(page, '[data-slot="nav-label"]', context);

  // The content column is never narrower than a phone's at the same text size. (At 768px and 200%
  // text a sidebar once left it ~190px wide, one letter per line, with nothing overlapping.)
  const column = await page.evaluate(() => {
    const main = document.getElementById('main-content')!;
    const style = getComputedStyle(main);
    const root = parseFloat(getComputedStyle(document.documentElement).fontSize);
    return {
      width: main.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
      minimum: Math.min(document.documentElement.clientWidth - 2 * root, 18 * root),
    };
  });
  expect(column.width, `${context}: content column width`).toBeGreaterThanOrEqual(
    column.minimum - 1,
  );
  await expectNoHorizontalScroll(page, context);
  await expectNoLayoutProblems(page, context);
}

for (const width of [320, 360, 390]) {
  test.describe(`shell on a ${width}px phone`, { tag: '@critical' }, () => {
    test.skip(({ isMobile }) => !isMobile, 'phone widths run in the mobile project');
    test.use({ viewport: { width, height: 740 } });

    test('header and bottom bar stay whole and separate as text grows', async ({ page }) => {
      for (const path of destinations) {
        await page.goto(path);
        for (const size of textSizes) {
          await setTextSize(page, size);
          await expectShellUsable(page, `${path} at ${width}px, ${size}% text`);
        }
      }
    });
  });
}

test.describe('shell at 320px and 200% text', { tag: '@critical' }, () => {
  test.skip(({ isMobile }) => !isMobile, 'phone widths run in the mobile project');
  test.use({ viewport: { width: 320, height: 740 } });

  test('the brand name is kept for assistive technology when only the logo shows', async ({
    page,
  }) => {
    await page.goto('/');
    await setTextSize(page, 200);
    const home = header(page).getByRole('link', { name: 'Avuneri' });
    await expect(home).toBeVisible();
    await expect(home.getByText('Avuneri')).toHaveClass(/sr-only/);
    await setTextSize(page, 100);
    await expect(home.getByText('Avuneri')).toBeVisible();
  });

  test('the last content clears the two-row bottom bar', async ({ page }) => {
    for (const path of ['/', '/library', '/lending']) {
      await page.goto(path);
      await setTextSize(page, 200);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const lastBottom = await page
        .locator('#main-content > :last-child')
        .evaluate((el) => el.getBoundingClientRect().bottom);
      const navTop = (await boxOf(primaryNav(page))).y;
      expect(lastBottom, path).toBeLessThanOrEqual(navTop);
    }
  });

  test('keyboard focus is never hidden behind the header or the bottom bar', async ({ page }) => {
    await page.goto('/');
    await setTextSize(page, 200);
    let checked = 0;
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      const focus = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || !el.closest('#main-content') || el.id === 'main-content') return null;
        const box = el.getBoundingClientRect();
        const headerBottom = document.querySelector('header')!.getBoundingClientRect().bottom;
        const navTop = document
          .querySelector('nav[aria-label="Primary"]')!
          .getBoundingClientRect().top;
        return {
          name: (el.textContent ?? '').trim().slice(0, 30),
          top: box.top,
          bottom: box.bottom,
          headerBottom,
          navTop,
        };
      });
      if (!focus) continue;
      checked++;
      const where = `"${focus.name}" at ${Math.round(focus.top)}–${Math.round(focus.bottom)}, visible area ${Math.round(focus.headerBottom)}–${Math.round(focus.navTop)}`;
      if (focus.bottom - focus.top <= focus.navTop - focus.headerBottom) {
        // Fits between the bars, so it must be fully visible: stronger than WCAG 2.4.11.
        expect(focus.top, `${where}: under the header`).toBeGreaterThanOrEqual(
          focus.headerBottom - 1,
        );
        expect(focus.bottom, `${where}: behind the bottom bar`).toBeLessThanOrEqual(
          focus.navTop + 1,
        );
      } else {
        // Taller than the space between the bars: never entirely hidden (WCAG 2.4.11).
        expect(focus.bottom, `${where}: hidden`).toBeGreaterThan(focus.headerBottom);
        expect(focus.top, `${where}: hidden`).toBeLessThan(focus.navTop);
      }
    }
    expect(checked).toBeGreaterThan(5);
  });

  test('the account menu opens inside the screen with a long name and address', async ({
    page,
  }) => {
    await page.goto('/');
    await setTextSize(page, 200);
    const account = header(page).getByRole('button', { name: /^Account:/ });
    await account.click();
    const panel = page.locator(`#${await account.getAttribute('aria-controls')}`);
    await panel.evaluate((el) => {
      el.querySelector('p')!.textContent =
        'Chimamanda Ngozi Adichie-Oyelaran Wolfeschlegelsteinhausenbergerdorff';
      el.querySelectorAll('p')[1]!.textContent =
        'a.very.long.address.without.natural.breaks@subdomain.example.test';
    });
    const box = await boxOf(panel);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
    // The panel hangs from the sticky header, so it must fit the screen and scroll inside itself.
    expect(box.y + box.height).toBeLessThanOrEqual(740);
    const logOut = panel.getByRole('button', { name: 'Log out' });
    await logOut.scrollIntoViewIfNeeded();
    await expect(logOut).toBeInViewport();
    await expectNoHorizontalScroll(page, 'account menu');
    await expectNoLayoutProblems(page, 'account menu');
  });
});

test.describe('shell in phone landscape', { tag: '@critical' }, () => {
  test.skip(({ isMobile }) => !isMobile, 'phone sizes run in the mobile project');
  test.use({ viewport: { width: 740, height: 360 } });

  test('stays usable at 100% and 200% text, and the header scrolls away', async ({ page }) => {
    await page.goto('/library');
    for (const size of textSizes) {
      await setTextSize(page, size);
      await expectShellUsable(page, `landscape, ${size}% text`);
    }
    await page.evaluate(() => window.scrollTo(0, 400));
    const top = await header(page).evaluate((el) => el.getBoundingClientRect().top);
    expect(top).toBeLessThan(0);
  });
});

for (const width of [768, 1024]) {
  test.describe(`shell on a ${width}px tablet`, { tag: '@critical' }, () => {
    test.skip(({ isMobile }) => isMobile, 'wide layouts run in the desktop project');
    test.use({ viewport: { width, height: 900 } });

    test('header and sidebar stay whole with large text and a long name', async ({ page }) => {
      for (const path of destinations) {
        await page.goto(path);
        for (const size of textSizes) {
          await setTextSize(page, size);
          await expectShellUsable(page, `${path} at ${width}px, ${size}% text`);
        }
      }
      await header(page)
        .getByRole('button', { name: /^Account:/ })
        .evaluate((button) => {
          const name = [...button.querySelectorAll('span')].at(-1)!;
          name.textContent = 'Chimamanda Ngozi Adichie-Oyelaran Wolfeschlegelsteinhausenberger';
        });
      await expectShellUsable(page, `long name at ${width}px`);
    });
  });
}

test.describe('critical screens at 320px and 200% text', { tag: '@critical' }, () => {
  test.skip(({ isMobile }) => !isMobile, 'phone widths run in the mobile project');
  test.use({ viewport: { width: 320, height: 720 } });

  test('reading finish and loan return dialogs fit and keep their actions reachable', async ({
    page,
    baseURL,
  }) => {
    test.slow();
    const reading = await seedReadingAndNotes(page, baseURL!);
    const lending = await seedLending(page, baseURL!);

    const dialogs: [string, string][] = [
      [`/reading/${reading.activeSessionId}`, 'Mark as finished…'],
      [`/lending/${lending.activeLoanId}`, 'Mark returned…'],
    ];
    for (const [path, opener] of dialogs) {
      await page.goto(path);
      await setTextSize(page, 200);
      await page.getByRole('button', { name: opener }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      const box = await boxOf(dialog);
      expect(box.x, path).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, path).toBeLessThanOrEqual(320);
      await expectNoLayoutProblems(page, `${path} dialog`);
      for (const button of await dialog.getByRole('button').all()) {
        await button.scrollIntoViewIfNeeded();
        await expect(button, path).toBeInViewport();
      }
    }
  });

  test('a long note editor keeps its fields and actions clear of the bars', async ({
    page,
    baseURL,
  }) => {
    const seeded = await seedReadingAndNotes(page, baseURL!);
    await page.goto(`/notes/new?bookId=${seeded.bookId}`);
    await setTextSize(page, 200);
    // Close to the 20,000-character limit.
    await page.getByLabel('Your note').fill('A long draft. '.repeat(1400));
    await expectNoHorizontalScroll(page, 'long note');
    await expectNoLayoutProblems(page, 'long note');
    const save = page.getByRole('button', { name: 'Save note' });
    await save.focus();
    const saveBox = await boxOf(save);
    const navTop = (await boxOf(primaryNav(page))).y;
    expect(saveBox.y + saveBox.height).toBeLessThanOrEqual(navTop + 1);
  });

  test('sign-in fits', async ({ browser, baseURL }) => {
    const context = await browser.newContext({
      baseURL: baseURL!,
      viewport: { width: 320, height: 720 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    for (const path of ['/login', '/register']) {
      await page.goto(path);
      await setTextSize(page, 200);
      await expectNoHorizontalScroll(page, path);
      await expectNoLayoutProblems(page, path);
    }
    await context.close();
  });
});
