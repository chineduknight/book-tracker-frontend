import 'server-only';
import { parseApiBaseUrl } from '@/lib/api/path';

export class BffConfigError extends Error {
  override readonly name = 'BffConfigError';
}

export interface BffConfig {
  apiBaseUrl: string;
  /** The exact origin browsers use for the app, e.g. `https://avuneri.example`. */
  appOrigin: string;
  /**
   * True when the app is served over HTTPS. Only a loopback `http://` APP_ORIGIN may be false, so
   * a reachable deployment always gets `Secure` `__Host-` cookies.
   */
  isHttps: boolean;
  sessionStore: SessionStoreLocation;
  /** 32 random bytes, the root of the session encryption and verifier keys. */
  sessionMasterKey: Buffer;
}

export interface SessionStoreLocation {
  uri: string;
  databaseName: string;
  /** True for every non-loopback server: the connection must be TLS with full verification. */
  requiresTls: boolean;
}

type Environment = Readonly<Record<string, string | undefined>>;

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const RESERVED_DATABASES = new Set(['admin', 'local', 'config', 'test']);
const DATABASE_NAME = /^[A-Za-z0-9_-]{1,63}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const ENCRYPTION_KEY_BYTES = 32;
const MINIMUM_DISTINCT_KEY_BYTES = 16;

interface Problem {
  variable: string;
  rule: string;
}

/**
 * Validates the BFF's server-only environment. It fails closed: there is no default, no in-memory
 * session fallback and no partial configuration. Errors name only variables and rules, never values.
 */
export function loadBffConfig(env: Environment = process.env): BffConfig {
  const problems: Problem[] = [];
  const read = (variable: string): string | undefined => {
    const value = env[variable]?.trim();
    if (!value) problems.push({ variable, rule: 'is required' });
    return value || undefined;
  };

  const appOrigin = parseAppOrigin(read('APP_ORIGIN'), problems);
  const isHttps = appOrigin?.startsWith('https://') ?? false;
  const apiBaseUrl = parseApi(read('API_BASE_URL'), isHttps, problems);
  const sessionStoreUri = read('BFF_SESSION_MONGODB_URI');
  const sessionStore = sessionStoreUri
    ? parseSessionStoreUri(sessionStoreUri, isHttps, problems)
    : undefined;
  const sessionMasterKey = parseEncryptionKey(read('BFF_SESSION_ENCRYPTION_KEY'), problems);

  if (problems.length > 0 || !appOrigin || !apiBaseUrl || !sessionStore || !sessionMasterKey) {
    const lines = problems.map(({ variable, rule }) => `  - ${variable}: ${rule}`);
    throw new BffConfigError(`Invalid BFF configuration:\n${lines.join('\n')}`);
  }
  return { apiBaseUrl, appOrigin, isHttps, sessionStore, sessionMasterKey };
}

/** For the operator index tool, which needs only the session store's location. */
export function loadSessionStoreLocation(
  env: Environment = process.env,
): BffConfig['sessionStore'] {
  const problems: Problem[] = [];
  const uri = env.BFF_SESSION_MONGODB_URI?.trim();
  if (!uri) problems.push({ variable: 'BFF_SESSION_MONGODB_URI', rule: 'is required' });
  const isHttps = env.APP_ORIGIN?.trim().startsWith('https://') ?? false;
  const location = uri ? parseSessionStoreUri(uri, isHttps, problems) : undefined;
  if (!location) {
    const lines = problems.map(({ variable, rule }) => `  - ${variable}: ${rule}`);
    throw new BffConfigError(`Invalid BFF configuration:\n${lines.join('\n')}`);
  }
  return location;
}

function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname.toLowerCase());
}

function parseAppOrigin(value: string | undefined, problems: Problem[]): string | undefined {
  if (!value) return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    problems.push({ variable: 'APP_ORIGIN', rule: 'must be an absolute URL' });
    return undefined;
  }
  if (url.origin === 'null' || `${url.origin}` !== value.replace(/\/$/, '')) {
    problems.push({
      variable: 'APP_ORIGIN',
      rule: 'must be an origin only (no path, query or credentials)',
    });
    return undefined;
  }
  if (url.protocol === 'https:') return url.origin;
  if (url.protocol === 'http:' && isLoopbackHost(url.hostname)) return url.origin;
  problems.push({
    variable: 'APP_ORIGIN',
    rule: 'must use https (http is allowed only for a loopback development origin)',
  });
  return undefined;
}

function parseApi(value: string | undefined, isHttps: boolean, problems: Problem[]) {
  if (!value) return undefined;
  let apiBaseUrl: string;
  try {
    apiBaseUrl = parseApiBaseUrl(value);
  } catch (error) {
    problems.push({ variable: 'API_BASE_URL', rule: (error as Error).message });
    return undefined;
  }
  if (isHttps && isLoopbackHost(new URL(apiBaseUrl).hostname)) {
    problems.push({
      variable: 'API_BASE_URL',
      rule: 'must not be a loopback URL when APP_ORIGIN is a deployed https origin',
    });
    return undefined;
  }
  return apiBaseUrl;
}

const TLS_SWITCHES = ['tls', 'ssl'];
const TLS_WEAKENERS = ['tlsinsecure', 'tlsallowinvalidcertificates', 'tlsallowinvalidhostnames'];

function parseSessionStoreUri(
  value: string,
  isHttps: boolean,
  problems: Problem[],
): SessionStoreLocation | undefined {
  const variable = 'BFF_SESSION_MONGODB_URI';
  const match = /^mongodb(\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)\/([^?]*)(\?.*)?$/.exec(value);
  if (!match) {
    problems.push({
      variable,
      rule: 'must be a mongodb:// or mongodb+srv:// URI with a database name',
    });
    return undefined;
  }
  const isSrv = match[1] !== undefined;
  const hosts = (match[2] ?? '').split(',').map((host) => host.replace(/:\d+$/, ''));
  const databaseName = decodeURIComponent(match[3] ?? '');
  if (!DATABASE_NAME.test(databaseName) || RESERVED_DATABASES.has(databaseName)) {
    problems.push({
      variable,
      rule: 'must name a dedicated session database (letters, digits, _ or -; not admin, local, config or test)',
    });
    return undefined;
  }
  if (isHttps && hosts.some(isLoopbackHost)) {
    problems.push({
      variable,
      rule: 'must not be a loopback host when APP_ORIGIN is a deployed https origin',
    });
    return undefined;
  }

  const requiresTls = isSrv || !hosts.every(isLoopbackHost);
  if (requiresTls) {
    const tlsProblem = remoteTlsProblemOf(new URLSearchParams(match[4]?.slice(1) ?? ''), isSrv);
    if (tlsProblem) {
      problems.push({ variable, rule: tlsProblem });
      return undefined;
    }
  }
  return { uri: value, databaseName, requiresTls };
}

/**
 * A remote session store carries database credentials and session metadata, so its connection must
 * be TLS with certificate and hostname checks. MongoDB option names are case-insensitive, and SRV
 * connections default to TLS; anything that disables or weakens it is refused.
 */
function remoteTlsProblemOf(options: URLSearchParams, isSrv: boolean): string | undefined {
  const valuesOf = (names: string[]) =>
    [...options]
      .filter(([name]) => names.includes(name.toLowerCase()))
      .map(([, setting]) => setting.toLowerCase());

  const tlsSettings = valuesOf(TLS_SWITCHES);
  if (tlsSettings.some((setting) => setting !== 'true')) {
    return 'must not disable TLS for a remote MongoDB server';
  }
  if (!isSrv && tlsSettings.length === 0) {
    return 'must enable TLS (tls=true) for a remote MongoDB server';
  }
  if (valuesOf(TLS_WEAKENERS).some((setting) => setting !== 'false')) {
    return 'must not weaken TLS certificate or hostname validation';
  }
  return undefined;
}

function parseEncryptionKey(value: string | undefined, problems: Problem[]) {
  if (!value) return undefined;
  const variable = 'BFF_SESSION_ENCRYPTION_KEY';
  const key = BASE64URL.test(value) ? Buffer.from(value, 'base64url') : undefined;
  if (!key || key.length !== ENCRYPTION_KEY_BYTES) {
    problems.push({
      variable,
      rule: `must be ${ENCRYPTION_KEY_BYTES} random bytes, base64url-encoded`,
    });
    return undefined;
  }
  if (new Set(key).size < MINIMUM_DISTINCT_KEY_BYTES) {
    problems.push({ variable, rule: 'must be randomly generated' });
    return undefined;
  }
  return key;
}
