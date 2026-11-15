import 'server-only';
import type { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from './bff-response';

export const MAX_SESSION_REQUEST_BYTES = 8 * 1024;

/**
 * CSRF defence for every state-changing session request, including sign-in and registration
 * (login CSRF). The `Origin` header must equal the configured APP_ORIGIN exactly; it is never
 * derived from `Host` or `X-Forwarded-*`, which a client or proxy could influence. A missing or
 * `null` origin is refused. `Sec-Fetch-Site` and a JSON-only content type add defence in depth:
 * a cross-site HTML form can send neither a matching origin nor `application/json`.
 */
export function rejectUnsafeMutation(request: NextRequest, appOrigin: string): NextResponse | null {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  if (origin !== appOrigin || (fetchSite !== null && fetchSite !== 'same-origin')) {
    return errorResponse(403, {
      code: 'FORBIDDEN_ORIGIN',
      message: 'This request could not be verified. Reload the page and try again.',
    });
  }

  const mediaType = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  if (mediaType !== 'application/json') {
    return errorResponse(415, {
      code: 'UNSUPPORTED_MEDIA_TYPE',
      message: 'Requests must be sent as JSON.',
    });
  }

  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (declaredLength > MAX_SESSION_REQUEST_BYTES) return payloadTooLarge();
  return null;
}

/** Reads at most {@link MAX_SESSION_REQUEST_BYTES}, whatever Content-Length claims. */
export async function readJsonBody(request: NextRequest): Promise<unknown | NextResponse> {
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_SESSION_REQUEST_BYTES) {
        await reader.cancel();
        return payloadTooLarge();
      }
      chunks.push(value);
    }
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    return errorResponse(400, {
      code: 'INVALID_JSON',
      message: 'The request body is not valid JSON.',
    });
  }
}

function payloadTooLarge(): NextResponse {
  return errorResponse(413, { code: 'PAYLOAD_TOO_LARGE', message: 'The request is too large.' });
}
