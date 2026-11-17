'use client';

import { useEffect } from 'react';

const MARGIN = 8;

/**
 * Keyboard focus is never hidden behind the sticky header or the phone bottom bar (WCAG 2.4.11).
 * `scroll-padding` on the root does this where focus scrolling honours it (Chromium, Firefox);
 * WebKit's does not, so after the browser's own scroll this nudges the page just enough. It acts
 * only for keyboard focus (`:focus-visible`) inside main, and does nothing when the control is
 * already in view.
 */
export function KeepFocusVisible() {
  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || target.id === 'main-content') return;
      if (!target.closest('#main-content') || !target.matches(':focus-visible')) return;
      requestAnimationFrame(() => {
        const box = target.getBoundingClientRect();
        const header = document.querySelector('header');
        const nav = document.querySelector('nav[aria-label="Primary"]');
        const top =
          header && getComputedStyle(header).position === 'sticky'
            ? header.getBoundingClientRect().bottom
            : 0;
        const bottom =
          nav && getComputedStyle(nav).position === 'fixed'
            ? nav.getBoundingClientRect().top
            : window.innerHeight;
        if (box.top >= top && box.bottom <= bottom) return;
        // Too tall to fit, or hidden above: show its top. Hidden below: show its bottom.
        const delta =
          box.height > bottom - top || box.top < top
            ? box.top - top - MARGIN
            : box.bottom - bottom + MARGIN;
        window.scrollBy({ top: delta, behavior: 'instant' });
      });
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, []);
  return null;
}
