import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { errorResponse } from './bff-response';

export const MAX_SESSION_REQUEST_BYTES = 8 * 1024;

/**
 * Library writes carry at most a 5,000-character description plus short fields. At up to four
 * UTF-8 bytes per character that stays well under 32 KiB, so this is the library routes' explicit
 * limit; the authentication routes keep 8 KiB.
 */
export const MAX_LIBRARY_REQUEST_BYTES = 32 * 1024;

export type MutationBody = { kind: 'json'; maxBytes: number } | { kind: 'none' };

const SESSION_BODY: MutationBody = { kind: 'json', maxBytes: MAX_SESSION_REQUEST_BYTES };

/**
 * CSRF defence for every state-changing request (POST, PUT, PATCH and DELETE, including sign-in
 * and registration). The `Origin` header must equal the configured APP_ORIGIN exactly; it is never
 * derived from `Host` or `X-Forwarded-*`, which a client or proxy could influence. A missing or
 * `null` origin is refused. `Sec-Fetch-Site` and a JSON-only content type add defence in depth:
 * a cross-site HTML form can send neither a matching origin nor `application/json`, and requests
 * that take no body must not carry one.
 */
export function rejectUnsafeMutation(
  request: NextRequest,
  appOrigin: string,
  body: MutationBody = SESSION_BODY,
): NextResponse | null {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  if (origin !== appOrigin || (fetchSite !== null && fetchSite !== 'same-origin')) {
    return errorResponse(403, {
      code: 'FORBIDDEN_ORIGIN',
      message: 'This request could not be verified. Reload the page and try again.',
    });
  }

  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (body.kind === 'none') {
    return declaredLength > 0 || request.headers.has('transfer-encoding')
      ? errorResponse(400, { code: 'VALIDATION_ERROR', message: 'This request takes no body.' })
      : null;
  }

  const mediaType = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  if (mediaType !== 'application/json') {
    return errorResponse(415, {
      code: 'UNSUPPORTED_MEDIA_TYPE',
      message: 'Requests must be sent as JSON.',
    });
  }
  if (declaredLength > body.maxBytes) return payloadTooLarge();
  return null;
}

/** Reads at most `maxBytes` of the body as text, whatever Content-Length claims. */
export async function readBodyText(
  request: NextRequest,
  maxBytes: number,
): Promise<string | NextResponse> {
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        return payloadTooLarge();
      }
      chunks.push(value);
    }
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Reads at most `maxBytes` and parses it as JSON. */
export async function readJsonBody(
  request: NextRequest,
  maxBytes = MAX_SESSION_REQUEST_BYTES,
): Promise<unknown | NextResponse> {
  const text = await readBodyText(request, maxBytes);
  if (isErrorResponse(text)) return text;
  try {
    return JSON.parse(text) as unknown;
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

export function isErrorResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}
