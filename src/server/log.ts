import 'server-only';

type Level = 'info' | 'warn' | 'error';

/**
 * Structured server log line. Only fixed event names and an explicit allowlist of safe details
 * are accepted: no session ids, cookies, tokens, emails, bodies or upstream error messages.
 */
export interface SafeLogDetails {
  reason?: string;
  /** The backend's X-Request-Id, to correlate with API logs. */
  requestId?: string | undefined;
  status?: number;
}

export function logEvent(level: Level, event: string, details: SafeLogDetails = {}): void {
  const line = JSON.stringify({ level, event, ...details, time: new Date().toISOString() });
  console[level](line);
}
