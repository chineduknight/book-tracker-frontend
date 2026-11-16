/**
 * The browser suite's own ports, defined once. They are deliberately separate from `npm run dev`
 * (port 3100), so a dev server can never be mistaken for a test server. Each can be overridden
 * with an environment variable; the config and every test worker read the same values.
 */
const DEV_PORT = 3100;

function portFrom(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  if (!/^[0-9]{4,5}$/.test(value) || Number(value) < 1024 || Number(value) > 65535) {
    throw new Error(`${name} must be a port number from 1024 to 65535`);
  }
  return Number(value);
}

export const E2E_PORTS = {
  /** The app wired to the fake auth API (session faults, outages). */
  fakeApp: portFrom('E2E_FAKE_APP_PORT', 3300),
  /** The app wired to the real API. */
  realApp: portFrom('E2E_REAL_APP_PORT', 3200),
  fakeApi: portFrom('E2E_FAKE_API_PORT', 3901),
  realApi: portFrom('E2E_REAL_API_PORT', 3002),
} as const;

const ports = Object.values(E2E_PORTS);
if (new Set(ports).size !== ports.length) {
  throw new Error('The browser suite needs four different ports (E2E_*_PORT)');
}
if (ports.includes(DEV_PORT)) {
  throw new Error(
    `Port ${DEV_PORT} belongs to \`npm run dev\`; give the browser suite another one`,
  );
}

export const FAKE_APP = `http://localhost:${E2E_PORTS.fakeApp}`;
export const REAL_APP = `http://localhost:${E2E_PORTS.realApp}`;
export const FAKE_API = `http://127.0.0.1:${E2E_PORTS.fakeApi}`;
export const REAL_API = `http://127.0.0.1:${E2E_PORTS.realApi}`;
