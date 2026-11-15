import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { z } from 'zod';
import { ApiError } from '@/lib/api/errors';
import type { SessionApiFieldError, SignedInProfile } from '@/lib/auth/session-api';
import {
  loginRequestSchema,
  registrationRequestSchema,
  type AuthenticatedSession,
} from '../auth/auth-schemas';
import { logEvent } from '../log';
import { expiredSessionCookie, sessionCookie, sessionCookieName } from '../session/session-cookie';
import { SessionEndedError, SessionUnavailableError } from '../session/session-errors';
import type { BffRuntime } from '../session/session-runtime';
import { dataResponse, errorResponse, serviceUnavailableResponse } from './bff-response';
import { readJsonBody, rejectUnsafeMutation } from './mutation-guard';

const FIELD_MESSAGES: Record<string, Record<string, string>> = {
  register: {
    name: 'Enter a name of 1 to 100 characters.',
    email: 'Enter a valid email address of at most 254 characters.',
    password: 'Use a password of 12 to 128 characters.',
  },
  login: {
    email: 'Enter a valid email address of at most 254 characters.',
    password: 'Enter your password (at most 128 characters).',
  },
};

export async function handleRegister(request: NextRequest, runtime: BffRuntime) {
  return signIn(request, runtime, 'register', registrationRequestSchema, (registration) =>
    runtime.backend.register(registration),
  );
}

export async function handleLogin(request: NextRequest, runtime: BffRuntime) {
  return signIn(request, runtime, 'login', loginRequestSchema, (credentials) =>
    runtime.backend.login(credentials),
  );
}

export async function handleLogout(request: NextRequest, runtime: BffRuntime) {
  const rejected = rejectUnsafeMutation(request, runtime.config.appOrigin);
  if (rejected) return rejected;
  const body = await readJsonBody(request);
  if (body instanceof NextResponse) return body;

  const sessionSecret = request.cookies.get(sessionCookieName(runtime.config.isHttps))?.value;
  let response: NextResponse;
  try {
    const backendSignOut = sessionSecret
      ? await runtime.sessions.endSession(sessionSecret)
      : 'not-needed';
    response = dataResponse({ backendSignOut });
  } catch (error) {
    if (!(error instanceof SessionUnavailableError)) throw error;
    // The cookie is still removed: this browser can no longer use the session.
    response = serviceUnavailableResponse(
      'You are signed out on this device, but Avuneri could not reach its session service to end the session everywhere. It will expire on its own.',
    );
  }
  response.cookies.set(expiredSessionCookie(runtime.config.isHttps));
  return response;
}

/**
 * Read-only: it never creates a session. Keeping the session usable may exchange the refresh
 * token internally, which changes only server-side state, never the cookie.
 */
export async function handleCurrentUser(request: NextRequest, runtime: BffRuntime) {
  const sessionSecret = request.cookies.get(sessionCookieName(runtime.config.isHttps))?.value;
  if (!sessionSecret) return unauthenticated();
  try {
    const user = await runtime.sessions.currentUser(sessionSecret);
    return dataResponse({ user: toProfile(user) });
  } catch (error) {
    if (error instanceof SessionEndedError) {
      const response = unauthenticated();
      response.cookies.set(expiredSessionCookie(runtime.config.isHttps));
      return response;
    }
    if (error instanceof SessionUnavailableError) return sessionUnavailable(error);
    throw error;
  }
}

async function signIn<Schema extends z.ZodType>(
  request: NextRequest,
  runtime: BffRuntime,
  kind: 'register' | 'login',
  schema: Schema,
  authenticate: (input: z.output<Schema>) => Promise<AuthenticatedSession>,
): Promise<NextResponse> {
  const rejected = rejectUnsafeMutation(request, runtime.config.appOrigin);
  if (rejected) return rejected;
  const body = await readJsonBody(request);
  if (body instanceof NextResponse) return body;

  const parsed = schema.safeParse(body);
  if (!parsed.success) return validationFailed(kind, fieldsOf(parsed.error.issues));

  const requestedAt = new Date();
  let signedIn: AuthenticatedSession;
  try {
    signedIn = await authenticate(parsed.data);
  } catch (error) {
    return backendFailure(kind, error);
  }

  await endPreviousSession(request, runtime);
  let started;
  try {
    started = await runtime.sessions.startSession(signedIn, requestedAt);
  } catch (error) {
    if (error instanceof SessionUnavailableError) return serviceUnavailableResponse();
    throw error;
  }

  // A fresh random cookie on every sign-in, so a planted cookie can never be upgraded (fixation).
  const response = dataResponse(
    { user: toProfile(signedIn.user) },
    kind === 'register' ? 201 : 200,
  );
  response.cookies.set(
    sessionCookie(runtime.config.isHttps, started.sessionSecret, started.expiresAt),
  );
  return response;
}

async function endPreviousSession(request: NextRequest, runtime: BffRuntime): Promise<void> {
  const previous = request.cookies.get(sessionCookieName(runtime.config.isHttps))?.value;
  if (!previous) return;
  try {
    await runtime.sessions.endSession(previous);
  } catch {
    // The new session does not depend on it; an unreachable store fails the sign-in next anyway.
  }
}

function toProfile(user: { name: string; email: string }): SignedInProfile {
  return { name: user.name, email: user.email };
}

function fieldsOf(issues: readonly z.core.$ZodIssue[]): Array<string | undefined> {
  return issues.map((issue) => (typeof issue.path[0] === 'string' ? issue.path[0] : undefined));
}

function validationFailed(kind: 'register' | 'login', fields: Array<string | undefined>) {
  const messages = FIELD_MESSAGES[kind] ?? {};
  const known: SessionApiFieldError[] = [...new Set(fields)].flatMap((field) =>
    field && messages[field] ? [{ field, message: messages[field] }] : [],
  );
  return errorResponse(400, {
    code: 'VALIDATION_ERROR',
    message:
      known.length === fields.length
        ? 'Some details need correcting.'
        : 'The request contains unexpected or missing fields.',
    fields: known,
  });
}

function backendFailure(kind: 'register' | 'login', error: unknown): NextResponse {
  if (!(error instanceof ApiError)) {
    logEvent('warn', `session.${kind}_backend_unavailable`, {
      reason: error instanceof Error ? error.name : 'unknown',
    });
    return serviceUnavailableResponse();
  }
  switch (error.status) {
    case 400:
      return validationFailed(
        kind,
        error.details.map((detail) => detail.field),
      );
    case 401:
      return errorResponse(401, {
        code: 'INVALID_CREDENTIALS',
        message: 'Email or password is incorrect.',
      });
    case 409:
      return errorResponse(409, {
        code: 'EMAIL_TAKEN',
        message: 'An account with this email already exists.',
        fields: [{ field: 'email', message: 'An account with this email already exists.' }],
      });
    case 429:
      return errorResponse(429, {
        code: 'RATE_LIMITED',
        message: 'Too many attempts. Please wait before trying again.',
        ...(error.retryAfterSeconds === undefined
          ? {}
          : { retryAfterSeconds: error.retryAfterSeconds }),
      });
    default:
      logEvent('warn', `session.${kind}_backend_error`, {
        status: error.status,
        requestId: error.requestId,
      });
      return serviceUnavailableResponse();
  }
}

function unauthenticated(): NextResponse {
  return errorResponse(401, { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' });
}

function sessionUnavailable(error: SessionUnavailableError): NextResponse {
  if (error.reason === 'rate-limited') {
    return errorResponse(429, {
      code: 'RATE_LIMITED',
      message: 'Too many requests. Please wait before trying again.',
      ...(error.retryAfterSeconds === undefined
        ? {}
        : { retryAfterSeconds: error.retryAfterSeconds }),
    });
  }
  return serviceUnavailableResponse();
}
