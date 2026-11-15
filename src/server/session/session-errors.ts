export type SessionEndReason =
  | 'missing'
  | 'corrupted'
  | 'refresh-rejected'
  | 'refresh-uncertain'
  | 'refresh-abandoned'
  | 'ended-during-refresh'
  | 'revoked-by-backend';

/** The session no longer exists or can no longer be trusted: the visitor must sign in again. */
export class SessionEndedError extends Error {
  override readonly name = 'SessionEndedError';

  constructor(readonly reason: SessionEndReason) {
    super('The session has ended');
  }
}

export type SessionUnavailableReason =
  'store-unavailable' | 'backend-unavailable' | 'rate-limited' | 'refresh-wait-timeout';

/** A temporary failure: the session may still be valid, so the visitor should try again. */
export class SessionUnavailableError extends Error {
  override readonly name = 'SessionUnavailableError';

  constructor(
    readonly reason: SessionUnavailableReason,
    readonly retryAfterSeconds?: number,
  ) {
    super('The session service is temporarily unavailable');
  }
}
