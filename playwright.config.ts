import { randomBytes } from 'node:crypto';
import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
const FAKE_API_PORT = 3901;
const baseURL = `http://localhost:${PORT}`;
const isCI = Boolean(process.env.CI);

/**
 * End-to-end tests run the production build against a local fake of the API's auth endpoints
 * (e2e/support/fake-auth-api.mjs) and a local, disposable MongoDB for BFF sessions. They never
 * contact the real API, a real account or any production service.
 */
const sessionStoreUri =
  process.env.E2E_SESSION_MONGODB_URI ?? 'mongodb://127.0.0.1:27018/avuneri-bff-e2e';
if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/avuneri-bff-e2e$/.test(sessionStoreUri)) {
  throw new Error('E2E_SESSION_MONGODB_URI must be a local avuneri-bff-e2e database');
}

const FAKE_API_URL = `http://127.0.0.1:${FAKE_API_PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: [
    {
      command: 'node e2e/support/fake-auth-api.mjs',
      url: `${FAKE_API_URL}/__test/health`,
      env: { FAKE_API_PORT: String(FAKE_API_PORT) },
      reuseExistingServer: false,
    },
    {
      // CI builds once in an earlier step; locally, build first so tests never run stale output.
      command: `${isCI ? '' : 'npm run build && '}npm run session-store:indexes -- --apply && npm run start`,
      url: `${baseURL}/login`,
      reuseExistingServer: !isCI,
      timeout: 180_000,
      env: {
        NEXT_TELEMETRY_DISABLED: '1',
        APP_ORIGIN: baseURL,
        API_BASE_URL: `${FAKE_API_URL}/api/v1`,
        BFF_SESSION_MONGODB_URI: sessionStoreUri,
        BFF_SESSION_ENCRYPTION_KEY:
          process.env.E2E_SESSION_ENCRYPTION_KEY ?? randomBytes(32).toString('base64url'),
      },
    },
  ],
});
