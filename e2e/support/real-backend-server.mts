/**
 * Playwright web server: runs the merged API from BACKEND_DIR against a disposable local database
 * for the duration of the run, then drops that database.
 */
import { startRealBackend } from '../../src/test/backend/real-backend';

const backend = await startRealBackend({
  purpose: 'e2e',
  port: Number(process.env.REAL_API_PORT ?? 3002),
  log: (line) => process.stdout.write(line),
});
console.log(`Real API ready at ${backend.apiBaseUrl}`);

const stop = async () => {
  await backend.stop();
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
