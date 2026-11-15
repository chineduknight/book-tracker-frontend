// Verifies the WCAG contrast ratios of the design tokens in src/app/globals.css.
// Usage: node scripts/check-contrast.mjs
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');

function tokens(block) {
  return Object.fromEntries(
    [...block.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6});/gi)].map((m) => [m[1], m[2]]),
  );
}

const light = tokens(
  css.slice(css.indexOf(':root {'), css.indexOf('@media (prefers-color-scheme')),
);
const darkStart = css.indexOf('@media (prefers-color-scheme: dark)');
const dark = tokens(css.slice(darkStart, css.indexOf('@theme inline')));

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// [foreground, background, minimum]
const pairs = [
  ['ink', 'canvas', 4.5],
  ['ink', 'surface', 4.5],
  ['ink-muted', 'canvas', 4.5],
  ['ink-muted', 'surface', 4.5],
  ['ink-muted', 'surface-muted', 4.5],
  ['accent', 'canvas', 4.5],
  ['accent', 'surface', 4.5],
  ['accent-ink', 'accent-soft', 4.5],
  ['on-accent', 'accent', 4.5],
  ['on-accent', 'accent-hover', 4.5],
  ['danger', 'danger-soft', 4.5],
  ['danger', 'surface', 4.5],
  ['line-strong', 'surface', 3],
  ['line-strong', 'canvas', 3],
  ['focus', 'canvas', 3],
  ['focus', 'surface', 3],
];

let failed = false;
for (const [name, theme] of [
  ['light', light],
  ['dark', dark],
]) {
  for (const [fg, bg, min] of pairs) {
    const r = ratio(theme[fg], theme[bg]);
    const ok = r >= min;
    failed ||= !ok;
    console.log(
      `${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(5)} ${`${fg} on ${bg}`.padEnd(30)} ${r.toFixed(2)} (≥ ${min})`,
    );
  }
}
process.exitCode = failed ? 1 : 0;
