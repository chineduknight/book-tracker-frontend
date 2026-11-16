import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { MongoClient } from 'mongodb';

/**
 * Starts the merged Book Tracker API from a local checkout (BACKEND_DIR) against a disposable,
 * local MongoDB database, for contract tests and browser tests. It never touches a remote
 * service: the database server must be loopback and the database name is generated and allowlisted.
 */
const DISPOSABLE_DATABASE = /^book-tracker-fe-(contract|e2e)-[a-z0-9]{8}$/;
const LOOPBACK_MONGO = /^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/;

export interface RunningBackend {
  apiBaseUrl: string;
  stop(): Promise<void>;
}

export async function startRealBackend(options: {
  purpose: 'contract' | 'e2e';
  port: number;
  log?: (line: string) => void;
}): Promise<RunningBackend> {
  const backendDir = process.env.BACKEND_DIR;
  if (!backendDir || !existsSync(join(backendDir, 'src', 'server.ts'))) {
    throw new Error(
      'BACKEND_DIR must point to a checkout of book-tracker-backend main with dependencies installed (see README → Real-backend tests).',
    );
  }
  const mongoServer = process.env.BACKEND_TEST_MONGODB_URI ?? 'mongodb://127.0.0.1:27018';
  if (!LOOPBACK_MONGO.test(mongoServer)) {
    throw new Error(
      'BACKEND_TEST_MONGODB_URI must be a loopback mongodb:// server without a database',
    );
  }
  const databaseName = `book-tracker-fe-${options.purpose}-${randomBytes(6).toString('hex').slice(0, 8)}`;
  if (!DISPOSABLE_DATABASE.test(databaseName))
    throw new Error('Refusing a non-disposable database name');

  const api: ChildProcess = spawn(
    join(backendDir, 'node_modules', '.bin', 'tsx'),
    ['src/server.ts'],
    {
      cwd: backendDir,
      env: {
        PATH: process.env.PATH,
        NODE_ENV: 'development',
        PORT: String(options.port),
        MONGODB_URI: `${mongoServer.replace(/\/$/, '')}/${databaseName}`,
        LOG_LEVEL: 'warn',
        JWT_ACCESS_TOKEN_SECRET: randomBytes(32).toString('base64url'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  api.stdout?.on('data', (chunk: Buffer) => options.log?.(chunk.toString()));
  api.stderr?.on('data', (chunk: Buffer) => options.log?.(chunk.toString()));

  const apiBaseUrl = `http://127.0.0.1:${options.port}/api/v1`;
  const deadline = Date.now() + 60_000;
  for (;;) {
    if (api.exitCode !== null) throw new Error(`The API exited early (code ${api.exitCode})`);
    try {
      if ((await fetch(`${apiBaseUrl}/ready`)).ok) break;
    } catch {
      // Not listening yet.
    }
    if (Date.now() > deadline) {
      api.kill('SIGTERM');
      throw new Error('The API did not become ready within 60 s');
    }
    await sleep(250);
  }

  return {
    apiBaseUrl,
    async stop() {
      api.kill('SIGTERM');
      await new Promise((resolve) => api.once('exit', resolve));
      const client = new MongoClient(mongoServer, { serverSelectionTimeoutMS: 5_000 });
      try {
        if (DISPOSABLE_DATABASE.test(databaseName)) await client.db(databaseName).dropDatabase();
      } finally {
        await client.close();
      }
    },
  };
}
