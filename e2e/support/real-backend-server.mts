/**
 * Playwright web server: runs the merged API from BACKEND_DIR against a disposable local database
 * for the duration of the run, then drops that database.
 */
import { startRealBackend } from '../../src/test/backend/real-backend';

// Passed by playwright.config.ts from e2e/support/ports.ts, the one place test ports are defined.
const port = Number(process.env.REAL_API_PORT);
if (!Number.isInteger(port) || port <= 0) throw new Error('REAL_API_PORT is required');

const backend = await startRealBackend({
  purpose: 'e2e',
  port,
  log: (line) => process.stdout.write(line),
});
console.log(`Real API ready at ${backend.apiBaseUrl}`);

const stop = async () => {
  await backend.stop();
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
