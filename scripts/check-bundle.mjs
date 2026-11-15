// Scans the production browser bundle for things that must never reach a browser: the server-only
// API configuration, NEXT_PUBLIC_ variables, bearer tokens and backend URLs.
//
// Usage: build with a sentinel API_BASE_URL, then run this script:
//   API_BASE_URL=https://bundle-sentinel.invalid/api/v1 npm run build && npm run check:bundle
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const staticDir = new URL('../.next/static', import.meta.url).pathname;

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (/\.(js|css|html|json|map)$/.test(name)) yield path;
  }
}

const forbidden = [
  ['the API_BASE_URL variable name', /API_BASE_URL/],
  ['a NEXT_PUBLIC_ variable', /NEXT_PUBLIC_/],
  ['the bundle sentinel host', /bundle-sentinel\.invalid/],
  ['a local backend URL', /localhost:3000/],
  ['the API prefix', /\/api\/v1/],
  ['an Authorization header', /Authorization/],
  ['a JWT', /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}/],
  ['a MongoDB URI', /mongodb(\+srv)?:\/\//],
];

let scanned = 0;
const findings = [];
for (const file of files(staticDir)) {
  scanned += 1;
  const text = readFileSync(file, 'utf8');
  for (const [label, pattern] of forbidden) {
    if (pattern.test(text)) findings.push(`${label} in ${file.slice(staticDir.length + 1)}`);
  }
}

if (scanned === 0) {
  console.error('No browser bundle found. Run `npm run build` first.');
  process.exit(1);
}
if (findings.length > 0) {
  console.error(`Browser bundle check failed:\n- ${findings.join('\n- ')}`);
  process.exit(1);
}
console.log(`Browser bundle check passed: ${scanned} files, no forbidden content.`);
