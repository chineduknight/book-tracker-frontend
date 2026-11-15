/**
 * Operator tool for the BFF session store's indexes.
 *
 *   npm run session-store:indexes             verify only (read-only); exits 1 if not ready
 *   npm run session-store:indexes -- --apply  create missing indexes; never drops or changes one
 *
 * Reads BFF_SESSION_MONGODB_URI (and APP_ORIGIN for its production rules). Prints index names and
 * outcomes only, never the URI.
 */
import { MongoClient } from 'mongodb';
import { loadSessionStoreLocation } from '../src/server/config';
import {
  SESSION_COLLECTION,
  createMissingSessionIndexes,
  inspectSessionIndexes,
} from '../src/server/session/session-indexes';

const apply = process.argv.includes('--apply');
const { uri, databaseName } = loadSessionStoreLocation();
const client = new MongoClient(uri, {
  appName: 'avuneri-bff-indexes',
  serverSelectionTimeoutMS: 10_000,
});

try {
  const collection = client.db(databaseName).collection(SESSION_COLLECTION);
  if (apply) {
    const created = await createMissingSessionIndexes(collection);
    console.log(created.length > 0 ? `Created: ${created.join(', ')}` : 'Nothing to create.');
  }
  const report = await inspectSessionIndexes(collection);
  if (report.missing.length > 0 || report.conflicting.length > 0) {
    console.error(
      `Session store NOT ready. Missing: ${report.missing.join(', ') || 'none'}; conflicting: ${report.conflicting.join(', ') || 'none'}.`,
    );
    process.exitCode = 1;
  } else {
    console.log(`Session store indexes verified in ${databaseName}.${SESSION_COLLECTION}.`);
  }
} finally {
  await client.close();
}
