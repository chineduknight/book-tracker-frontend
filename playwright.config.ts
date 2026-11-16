import { randomBytes } from 'node:crypto';
import { defineConfig, devices } from '@playwright/test';

/*
 * Two production-build app instances:
 *   3100 → a local fake of the API's auth endpoints (e2e/support/fake-auth-api.mjs), for session
 *          faults the real API cannot be made to produce on demand (outage, rate limit, short
 *          sessions, forced revocation, library outage);
 *   3200 → the real, merged Book Tracker API started from BACKEND_DIR against a disposable local
 *          database (e2e/support/real-backend-server.mts), for every library journey.
 * Nothing contacts a real account, a remote database or any production service.
 */
const isCI = Boolean(process.env.CI);
const FAKE_APP = 'http://localhost:3100';
const REAL_APP = 'http://localhost:3200';
const FAKE_API = 'http://127.0.0.1:3901';
const REAL_API = 'http://127.0.0.1:3002';

const sessionStoreUri =
  process.env.E2E_SESSION_MONGODB_URI ?? 'mongodb://127.0.0.1:27018/avuneri-bff-e2e';
if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/avuneri-bff-e2e$/.test(sessionStoreUri)) {
  throw new Error('E2E_SESSION_MONGODB_URI must be a local avuneri-bff-e2e database');
}
if (!process.env.BACKEND_DIR) {
  throw new Error(
    'BACKEND_DIR must point to a checkout of book-tracker-backend main (README → Real-backend tests)',
  );
}

// Shared with worker processes (they inherit the environment), so per-worker reader accounts are
// the same across worker restarts within one run; see e2e/support/reader.ts.
process.env.E2E_RUN_ID ??= randomBytes(4).toString('hex');

const encryptionKey =
  process.env.E2E_SESSION_ENCRYPTION_KEY ?? randomBytes(32).toString('base64url');
const appEnv = (origin: string, api: string) => ({
  NEXT_TELEMETRY_DISABLED: '1',
  APP_ORIGIN: origin,
  API_BASE_URL: `${api}/api/v1`,
  BFF_SESSION_MONGODB_URI: sessionStoreUri,
  BFF_SESSION_ENCRYPTION_KEY: encryptionKey,
});

const fakeApiSpecs = ['auth.spec.ts', 'security.spec.ts', 'library-outage.spec.ts'];
const realApiSpecs = [
  'navigation.spec.ts',
  'responsive.spec.ts',
  'accessibility.spec.ts',
  'library.spec.ts',
  'library-security.spec.ts',
  'reading.spec.ts',
  'notes.spec.ts',
  'reading-notes-layout.spec.ts',
  'lending.spec.ts',
  'home.spec.ts',
  'walkthrough.spec.ts',
];
const mobile = devices['Pixel 7'];
const desktop = { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } };

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // One real API process serves every library test; more parallel browsers only add contention.
  ...(isCI ? {} : { workers: 3 }),
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: { trace: 'retain-on-failure' },
  projects: [
    { name: 'mobile-chromium', testMatch: fakeApiSpecs, use: { ...mobile, baseURL: FAKE_APP } },
    { name: 'desktop-chromium', testMatch: fakeApiSpecs, use: { ...desktop, baseURL: FAKE_APP } },
    { name: 'library-mobile', testMatch: realApiSpecs, use: { ...mobile, baseURL: REAL_APP } },
    { name: 'library-desktop', testMatch: realApiSpecs, use: { ...desktop, baseURL: REAL_APP } },
  ],
  webServer: [
    {
      command: 'node e2e/support/fake-auth-api.mjs',
      url: `${FAKE_API}/__test/health`,
      env: { FAKE_API_PORT: '3901' },
      reuseExistingServer: false,
    },
    {
      command: 'npx tsx --conditions=react-server e2e/support/real-backend-server.mts',
      url: `${REAL_API}/api/v1/ready`,
      env: { REAL_API_PORT: '3002', BACKEND_DIR: process.env.BACKEND_DIR },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // CI builds once in an earlier step; locally, build first so tests never run stale output.
      command: `${isCI ? '' : 'npm run build && '}npm run session-store:indexes -- --apply && npx next start --port 3100`,
      url: `${FAKE_APP}/login`,
      reuseExistingServer: !isCI,
      timeout: 180_000,
      env: appEnv(FAKE_APP, FAKE_API),
    },
    {
      command: 'npx next start --port 3200',
      url: `${REAL_APP}/login`,
      reuseExistingServer: !isCI,
      timeout: 180_000,
      env: appEnv(REAL_APP, REAL_API),
    },
  ],
});
