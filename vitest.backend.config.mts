import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Contract tests against the real, merged Book Tracker API (started from BACKEND_DIR) and a
 * disposable local MongoDB. See src/test/backend/real-backend.ts.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./src/test/server-only-stub.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.backend.test.ts'],
    globalSetup: ['./src/test/backend/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 90_000,
    fileParallelism: false,
  },
});
