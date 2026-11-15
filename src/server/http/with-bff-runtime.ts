import 'server-only';
import type { NextRequest, NextResponse } from 'next/server';
import { BffConfigError } from '../config';
import { logEvent } from '../log';
import { getBffRuntime, type BffRuntime } from '../session/session-runtime';
import { serviceUnavailableResponse } from './bff-response';

type Handler = (request: NextRequest, runtime: BffRuntime) => Promise<NextResponse>;

/** Invalid configuration fails closed with a 503; the log names the variables, never values. */
export function withBffRuntime(handler: Handler) {
  return async (request: NextRequest): Promise<NextResponse> => {
    let runtime: BffRuntime;
    try {
      runtime = getBffRuntime();
    } catch (error) {
      if (!(error instanceof BffConfigError)) throw error;
      logEvent('error', 'bff.config_invalid', { reason: error.message });
      return serviceUnavailableResponse();
    }
    return handler(request, runtime);
  };
}
