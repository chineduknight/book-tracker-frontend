import type { Locator, Page } from '@playwright/test';
import { seedLending } from './support/lending';
import { expect, test } from './support/reader';
import { seedReadingAndNotes } from './support/reading-notes';

/*
 * Unsaved work and the browser's own Back and Forward, in a real browser (not a mocked popstate).
 * The guard cancels a same-document traversal through the Navigation API and asks first; it never
 * adds or rewrites history entries. Escape and "Keep editing" stay; "Discard changes" completes the
 * traversal the reader asked for.
 */

function guard(page: Page) {
  return page.getByRole('dialog', { name: 'Discard unsaved changes?' });
}

/** Puts the caret after the last character, as a reader carrying on writing would. */
async function toEnd(field: Locator) {
  await field.evaluate((el: HTMLInputElement | HTMLTextAreaElement) => {
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  });
}

async function historyLength(page: Page) {
  return page.evaluate(() => history.length);
}

/** Browser-initiated Back/Forward (as from the toolbar); a cancelled one may never "finish". */
async function back(page: Page) {
  await page.goBack({ timeout: 3_000 }).catch(() => null);
}
async function forward(page: Page) {
  await page.goForward({ timeout: 3_000 }).catch(() => null);
}

test.describe('Back and Forward with unsaved changes', { tag: '@critical' }, () => {
  test.skip(
    ({ isMobile, browserName }) => isMobile && browserName === 'chromium',
    'history behaviour is the same at every size; Chromium runs it on desktop',
  );

  test('a long note draft survives Back until the reader discards it', async ({
    page,
    baseURL,
  }) => {
    const seeded = await seedReadingAndNotes(page, baseURL!);
    await page.goto(`/notes?bookId=${seeded.bookId}`);
    await page.getByRole('link', { name: 'New note or highlight' }).click();
    await expect(page).toHaveURL(`/notes/new?bookId=${seeded.bookId}`);
    const entries = await historyLength(page);

    const content = page.getByLabel('Your note');
    const draft = 'Line after line of a long reflection.\n'.repeat(520).trim(); // ~19,800 characters
    await content.click();
    await content.fill(draft);
    await content.pressSequentially(' End.');

    await back(page);
    await expect(guard(page)).toBeVisible();
    await expect(page).toHaveURL(`/notes/new?bookId=${seeded.bookId}`);
    await guard(page).getByRole('button', { name: 'Keep editing' }).click();
    await expect(guard(page)).toBeHidden();
    await expect(content).toHaveValue(`${draft} End.`);
    expect(await historyLength(page)).toBe(entries);

    // The reader carries on writing, then tries to leave again. Escape is "Keep editing" too.
    await toEnd(content);
    await content.pressSequentially(' More.');
    await back(page);
    await expect(guard(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(guard(page)).toBeHidden();
    await expect(content).toHaveValue(`${draft} End. More.`);

    await toEnd(content);
    await content.pressSequentially('!');

    await back(page);
    await guard(page).getByRole('button', { name: 'Discard changes' }).click();
    await expect(page).toHaveURL(`/notes?bookId=${seeded.bookId}`);
    await expect(guard(page)).toBeHidden();
    expect(await historyLength(page)).toBe(entries);
  });

  test('Forward is guarded too; clean forms and in-page anchors never ask', async ({
    page,
    baseURL,
  }) => {
    const seeded = await seedReadingAndNotes(page, baseURL!);
    await page.goto('/reading');
    await page.locator(`a[href="/reading/${seeded.activeSessionId}"]`).first().click();
    await expect(page).toHaveURL(`/reading/${seeded.activeSessionId}`);

    // A clean form: Back and Forward go straight through.
    await back(page);
    await expect(page).toHaveURL('/reading');
    await expect(guard(page)).toHaveCount(0);
    await forward(page);
    await expect(page).toHaveURL(`/reading/${seeded.activeSessionId}`);

    // An in-page anchor adds an entry for the same page; moving across it loses nothing.
    await page.getByRole('link', { name: 'Skip to content' }).focus();
    await page.keyboard.press('Enter'); // #main-content
    await expect(page).toHaveURL(`/reading/${seeded.activeSessionId}#main-content`);
    const amount = page.getByLabel('Amount');
    await amount.click();
    await amount.fill('');
    await amount.pressSequentially('300');
    await back(page);
    await expect(page).toHaveURL(`/reading/${seeded.activeSessionId}`);
    await expect(guard(page)).toHaveCount(0);
    await expect(amount).toHaveValue('300');

    // Forward to another page with the form still changed: asked first.
    await forward(page);
    await expect(page).toHaveURL(`/reading/${seeded.activeSessionId}#main-content`);
    await back(page);
    await back(page);
    await expect(guard(page)).toBeVisible();
    await guard(page).getByRole('button', { name: 'Keep editing' }).click();
    await expect(page).toHaveURL(`/reading/${seeded.activeSessionId}`);
    await expect(amount).toHaveValue('300');
  });

  test('Forward from a changed form, a query-only change, and a nested dialog', async ({
    page,
    baseURL,
  }) => {
    const seeded = await seedLending(page, baseURL!);
    // /lending/new?bookId=… → /lending/new?copyId=…: the same path with a different query is a
    // different page, whose form would be lost.
    await page.goto(`/lending/new?bookId=${seeded.bookId}`);
    await page.getByRole('link', { name: /^Lend this copy: Reading copy/ }).click();
    await expect(page).toHaveURL(`/lending/new?copyId=${seeded.copyIds[2]}`);
    await back(page);
    await expect(page).toHaveURL(`/lending/new?bookId=${seeded.bookId}`);
    await forward(page);
    const borrower = page.getByLabel('Borrower');
    await borrower.click();
    await borrower.pressSequentially('Isioma');
    await back(page);
    await expect(guard(page)).toBeVisible();
    await guard(page).getByRole('button', { name: 'Keep editing' }).click();
    await expect(borrower).toHaveValue('Isioma');

    // The reader edits again, then leaves: asked again, and can still leave.
    await toEnd(borrower);
    await borrower.pressSequentially(' O.');
    await back(page);
    await guard(page).getByRole('button', { name: 'Discard changes' }).click();
    await expect(page).toHaveURL(`/lending/new?bookId=${seeded.bookId}`);

    // The guard over another dialog: a return date typed in "Mark returned…".
    await page.goto('/lending');
    await page.getByRole('link', { name: seeded.borrowers.active }).click();
    await expect(page).toHaveURL(`/lending/${seeded.activeLoanId}`);
    await page.getByRole('button', { name: 'Mark returned…' }).click();
    const returnDialog = page.getByRole('dialog', { name: /return/i });
    await returnDialog.getByLabel('Returned on').fill('2026-11-10');
    await back(page);
    await expect(guard(page)).toBeVisible();
    await guard(page).getByRole('button', { name: 'Keep editing' }).click();
    await expect(guard(page)).toBeHidden();
    await expect(returnDialog).toBeVisible();
    await expect(returnDialog.getByLabel('Returned on')).toHaveValue('2026-11-10');
    await expect(page).toHaveURL(`/lending/${seeded.activeLoanId}`);
  });
});

test.describe('A second Back straight after "Keep editing"', { tag: '@critical' }, () => {
  test.skip(
    ({ isMobile, browserName }) => isMobile && browserName === 'chromium',
    'Chromium runs it on desktop',
  );

  // Browsers let a page cancel a Back only after a fresh user interaction, so a reader cannot be
  // trapped. Whether choosing "Keep editing" counts differs between engines; this records what
  // each one does, and insists only that the reader is never stuck.
  test('either asks again or leaves; never stuck', async ({ page, baseURL, browserName }) => {
    const seeded = await seedReadingAndNotes(page, baseURL!);
    await page.goto(`/notes?bookId=${seeded.bookId}`);
    await page.getByRole('link', { name: 'New note or highlight' }).click();
    await expect(page).toHaveURL(`/notes/new?bookId=${seeded.bookId}`);
    const content = page.getByLabel('Your note');
    await content.click();
    await content.pressSequentially('Unsaved');
    await back(page);
    await expect(guard(page)).toBeVisible();
    await guard(page).getByRole('button', { name: 'Keep editing' }).click();
    await expect(guard(page)).toBeHidden();

    await back(page);
    await page.waitForTimeout(1_000);
    const asked = await guard(page).isVisible();
    const left = new URL(page.url()).pathname === '/notes';
    const outcome = asked ? 'asked again' : left ? 'left without asking' : 'stuck';
    console.log(`${browserName}: second Back straight after Keep editing: ${outcome}`);
    test
      .info()
      .annotations.push({ type: 'second Back', description: `${browserName}: ${outcome}` });
    expect(outcome).not.toBe('stuck');
  });
});
