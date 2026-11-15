'use client';

import { useState } from 'react';
import { loginPathFor } from '@/lib/auth/safe-redirect';
import { sendToBff, type BffMethod, type BffResult } from '@/lib/bff/bff-client';
import type { BffError } from '@/lib/bff/errors';
import { navigateTo } from '@/lib/navigation/hard-navigation';

/**
 * Sends one library write through the BFF, at most one at a time. An ended session goes to the
 * secure sign-in flow (returning here afterwards); nothing is updated optimistically, so a failed
 * write never looks saved.
 */
export function useBffAction() {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<BffError | null>(null);

  async function send<T>(
    method: BffMethod,
    path: string,
    body?: unknown,
  ): Promise<BffResult<T> | null> {
    if (isPending) return null;
    setIsPending(true);
    setError(null);
    const result = await sendToBff<T>(method, path, body);
    setIsPending(false);
    if (!result.ok) {
      if (result.status === 401) {
        navigateTo(loginPathFor(window.location.pathname));
        return result;
      }
      setError(result.error);
    }
    return result;
  }

  return { send, isPending, error, setError };
}
