import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/** Session-store tests against a real, local, disposable MongoDB (see src/test/integration). */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./src/test/server-only-stub.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    restoreMocks: true,
  },
});
