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
    // Boxes past the edge (where the overflow starts), or else content spilling out of a box
    // (text or an intrinsic control size wider than its element).
    const all = [...document.querySelectorAll('body *')].filter((el) => !inFixed(el));
    const boxes = all
      .filter((el) => el.getBoundingClientRect().right > width + 1)
      .filter((el) => (el.parentElement?.getBoundingClientRect().right ?? 0) <= width + 1);
    const spills = all.filter(
      (el) =>
        el.scrollWidth > el.clientWidth + 1 &&
        el.getBoundingClientRect().left + el.scrollWidth > width + 1,
    );
    const culprits = (boxes.length > 0 ? boxes : spills.slice(-5)).slice(0, 5).map((el) => {
      const box = el.getBoundingClientRect();
      const text = (el.textContent ?? '').trim().slice(0, 40);
      return `<${el.tagName.toLowerCase()} class="${String(el.className).slice(0, 80)}"> "${text}" [${Math.round(box.left)}–${Math.round(box.right)}]`;
    });
    return { overflow: document.documentElement.scrollWidth - width, culprits };
  });
  expect(overflow, `${context} overflow starts at: ${culprits.join(' | ')}`).toBeLessThanOrEqual(0);
}

/**
 * Sets the root font size, as a reader's enlarged default text does: every `rem` scales, so this
 * exercises the container queries that adapt the shell. (CSS media queries keep using the
 * browser's initial size, so a real text-size setting can switch layouts slightly earlier.)
 */
export async function setTextSize(page: Page, percent: number) {
  await page.evaluate((size) => {
    document.documentElement.style.fontSize = `${size}%`;
  }, percent);
  // Let layout and container queries settle before measuring.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))));
}

/**
 * Finds things a reader would see as broken even when nothing scrolls sideways:
 * - controls, headings and badges whose boxes overlap one another (compared per line box, so a
 *   link that wraps is not mistaken for a block covering its neighbours, and only within the same
 *   layer: page flow, the sticky header, the fixed bottom bar, or an open dialog);
 * - labels clipped by their own box (text wider or taller than an element that hides overflow).
 * When a modal dialog is open, only the dialog is checked: the page behind it is inert.
 */
export async function findLayoutProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const selector = [
      'a[href]',
      'button',
      'input:not([type="hidden"])',
      'select',
      'textarea',
      'summary',
      '[role="button"]',
      'h1',
      'h2',
      'h3',
      'label',
      '[data-slot="nav-label"]',
    ].join(',');
    const dialog = document.querySelector('dialog[open]');
    const root = dialog ?? document.body;

    const isShown = (el: Element) => {
      if (el.closest('[hidden], [aria-hidden="true"]')) return false;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none') return false;
      // Visually hidden until focused (the skip link, screen-reader-only text).
      for (let node: Element | null = el; node; node = node.parentElement) {
        const clip = getComputedStyle(node);
        if (clip.clipPath === 'inset(50%)' || clip.clip === 'rect(0px, 0px, 0px, 0px)')
          return false;
      }
      const box = el.getBoundingClientRect();
      return box.width > 1 && box.height > 1;
    };
    const layerOf = (el: Element): Element | null => {
      for (let node: Element | null = el; node; node = node.parentElement) {
        if (node.tagName === 'DIALOG') return node;
        const position = getComputedStyle(node).position;
        if (position === 'fixed' || position === 'sticky') return node;
      }
      return null;
    };
    const describe = (el: Element) =>
      `<${el.tagName.toLowerCase()}> "${(el.textContent ?? (el as HTMLInputElement).value ?? '').trim().slice(0, 30)}"`;

    const elements = [...root.querySelectorAll(selector)].filter(isShown);
    const problems: string[] = [];
    const items = elements.map((el) => ({
      el,
      layer: layerOf(el),
      rects: [...el.getClientRects()].filter((rect) => rect.width > 1 && rect.height > 1),
    }));
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i]!;
        const b = items[j]!;
        if (a.layer !== b.layer || a.el.contains(b.el) || b.el.contains(a.el)) continue;
        // A label wraps or sits beside its own control; that is association, not overlap.
        if (a.el.tagName === 'LABEL' || b.el.tagName === 'LABEL') {
          const label = (a.el.tagName === 'LABEL' ? a.el : b.el) as HTMLLabelElement;
          const other = label === a.el ? b.el : a.el;
          if (label.control === other) continue;
        }
        const hit = a.rects.some((r) =>
          b.rects.some(
            (s) =>
              Math.min(r.right, s.right) - Math.max(r.left, s.left) > 1 &&
              Math.min(r.bottom, s.bottom) - Math.max(r.top, s.top) > 1,
          ),
        );
        if (hit) problems.push(`overlap: ${describe(a.el)} × ${describe(b.el)}`);
      }
    }
    for (const el of elements) {
      if (!(el instanceof HTMLElement) || el.matches('input, textarea, select')) continue;
      const style = getComputedStyle(el);
      if (style.overflowX === 'visible' && style.overflowY === 'visible') continue;
      if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) {
        problems.push(`clipped: ${describe(el)}`);
      }
    }
    return problems;
  });
}

export async function expectNoLayoutProblems(page: Page, context = '') {
  expect(await findLayoutProblems(page), context).toEqual([]);
}

/**
 * Fails when any word in these elements is split across lines ("Libra / ry"): each word must lie
 * on a single line box.
 */
export async function expectWholeWords(page: Page, selector: string, context = '') {
  const split = await page.evaluate((sel) => {
    const broken: string[] = [];
    for (const el of document.querySelectorAll(sel)) {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent ?? '';
        for (const match of text.matchAll(/\S+/g)) {
          const range = document.createRange();
          range.setStart(node, match.index);
          range.setEnd(node, match.index + match[0].length);
          const lines = new Set(
            [...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)),
          );
          if (lines.size > 1) broken.push(match[0]);
        }
      }
    }
    return broken;
  }, selector);
  expect(split, `${context} words split across lines`).toEqual([]);
}
