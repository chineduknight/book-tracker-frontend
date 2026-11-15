import 'server-only';
import { NextResponse } from 'next/server';
import type { BffError } from '@/lib/bff/errors';

const PRIVATE_NO_STORE = 'no-store';

export function dataResponse<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data }, { status, headers: { 'Cache-Control': PRIVATE_NO_STORE } });
}

export function errorResponse(status: number, error: BffError): NextResponse {
  const headers = new Headers({ 'Cache-Control': PRIVATE_NO_STORE });
  if (error.retryAfterSeconds !== undefined) {
    headers.set('Retry-After', String(error.retryAfterSeconds));
  }
  return NextResponse.json({ error }, { status, headers });
}

export const SERVICE_UNAVAILABLE_MESSAGE =
  'Avuneri can’t reach its server right now. Please try again in a moment.';

export function serviceUnavailableResponse(message = SERVICE_UNAVAILABLE_MESSAGE): NextResponse {
  return errorResponse(503, { code: 'SERVICE_UNAVAILABLE', message });
}

export function noContentResponse(): NextResponse {
  return new NextResponse(null, { status: 204, headers: { 'Cache-Control': PRIVATE_NO_STORE } });
}
