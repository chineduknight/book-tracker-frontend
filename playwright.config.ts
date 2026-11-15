import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;
const isCI = Boolean(process.env.CI);

/**
 * End-to-end tests run against the production build of this app only. They never contact the
 * Book Tracker API, a real account or any production service.
 */
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
  webServer: {
    // CI builds once in an earlier step; locally, build first so tests never run against stale output.
    command: isCI ? 'npm run start' : 'npm run build && npm run start',
    url: baseURL,
    reuseExistingServer: !isCI,
    timeout: 180_000,
    env: { NEXT_TELEMETRY_DISABLED: '1' },
  },
});
