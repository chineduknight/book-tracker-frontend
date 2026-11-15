import { sendToBff, type BffResult } from '@/lib/bff/bff-client';

export type SessionApiResult<T> = BffResult<T>;

/** POSTs JSON to this app's own session API. `status` is 0 when no response arrived. */
export function postToSessionApi<T>(path: string, body: unknown): Promise<SessionApiResult<T>> {
  return sendToBff<T>('POST', path, body);
}
