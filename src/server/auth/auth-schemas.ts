import 'server-only';
import { z } from 'zod';
import {
  EMAIL_MAX_LENGTH,
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  REGISTRATION_PASSWORD_MIN_LENGTH,
} from '@/lib/auth/credential-policy';

/*
 * Request schemas mirror book-tracker-backend `auth.schema.ts` exactly (strict objects, trimmed
 * name, normalised email, untrimmed password), so the BFF rejects what the API would reject without
 * spending one of the API's rate-limited attempts.
 */
const normalizedEmail = z.string().trim().toLowerCase().max(EMAIL_MAX_LENGTH).pipe(z.email());

export const registrationRequestSchema = z.strictObject({
  name: z.string().trim().min(1).max(NAME_MAX_LENGTH),
  email: normalizedEmail,
  password: z.string().min(REGISTRATION_PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
});

export const loginRequestSchema = z.strictObject({
  email: normalizedEmail,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

export type RegistrationRequest = z.output<typeof registrationRequestSchema>;
export type LoginRequest = z.output<typeof loginRequestSchema>;

/* Responses from the API are validated before any token is persisted or any field is shown. */
const BEARER_TOKEN = /^[A-Za-z0-9\-._~+/]+=*$/;
const ONE_DAY_SECONDS = 24 * 60 * 60;

export const backendUserSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{24}$/),
  name: z.string().min(1).max(NAME_MAX_LENGTH),
  email: z.string().min(3).max(EMAIL_MAX_LENGTH),
  createdAt: z.string(),
});

export const sessionTokensSchema = z.object({
  accessToken: z.string().min(1).max(4096).regex(BEARER_TOKEN),
  refreshToken: z.string().min(1).max(256).regex(BEARER_TOKEN),
  tokenType: z.literal('Bearer'),
  expiresIn: z.number().int().positive().max(ONE_DAY_SECONDS),
  refreshExpiresIn: z
    .number()
    .int()
    .positive()
    .max(366 * ONE_DAY_SECONDS),
});

export const authenticatedSessionSchema = z.object({
  user: backendUserSchema,
  tokens: sessionTokensSchema,
});

export const refreshedSessionSchema = z.object({ tokens: sessionTokensSchema });
export const currentUserSchema = z.object({ user: backendUserSchema });

export type BackendUser = z.output<typeof backendUserSchema>;
export type SessionTokens = z.output<typeof sessionTokensSchema>;
export type AuthenticatedSession = z.output<typeof authenticatedSessionSchema>;
