import { expect, type Page } from '@playwright/test';

/**
 * Fails when the page scrolls sideways, naming the elements where the overflow starts (past the
 * edge while their parent is not), outside fixed bars, which cannot cause page scroll.
 */
export async function expectNoHorizontalScroll(page: Page, context = '') {
  const { overflow, culprits } = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const inFixed = (el: Element) => {
      for (let node: Element | null = el; node; node = node.parentElement) {
        if (getComputedStyle(node).position === 'fixed') return true;
      }
      return false;
    };
    const culprits = [...document.querySelectorAll('body *')]
      .filter((el) => el.getBoundingClientRect().right > width + 1)
      .filter((el) => (el.parentElement?.getBoundingClientRect().right ?? 0) <= width + 1)
      .filter((el) => !inFixed(el))
      .slice(0, 5)
      .map((el) => {
        const box = el.getBoundingClientRect();
        const text = (el.textContent ?? '').trim().slice(0, 40);
        return `<${el.tagName.toLowerCase()} class="${String(el.className).slice(0, 80)}"> "${text}" [${Math.round(box.left)}–${Math.round(box.right)}]`;
      });
    return { overflow: document.documentElement.scrollWidth - width, culprits };
  });
  expect(overflow, `${context} overflow starts at: ${culprits.join(' | ')}`).toBeLessThanOrEqual(0);
}
