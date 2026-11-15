/**
 * The backend's credential rules (book-tracker-backend `auth.schema.ts`), shared by the browser
 * forms for immediate feedback and by the BFF's authoritative server-side validation. Lengths are
 * counted in UTF-16 code units, exactly as the backend's Zod schemas count them.
 */
export const NAME_MAX_LENGTH = 100;
export const EMAIL_MAX_LENGTH = 254;
export const REGISTRATION_PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export type RegistrationField = 'name' | 'email' | 'password';
export type LoginField = 'email' | 'password';
export type FieldErrors<Field extends string> = Partial<Record<Field, string>>;

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function emailProblemOf(email: string): string | undefined {
  const normalized = normalizeEmail(email);
  if (normalized.length === 0) return 'Enter your email address.';
  if (normalized.length > EMAIL_MAX_LENGTH) {
    return `Use an email address of at most ${EMAIL_MAX_LENGTH} characters.`;
  }
  if (!EMAIL_SHAPE.test(normalized)) return 'Enter an email address like name@example.com.';
  return undefined;
}

export function validateRegistration(input: {
  name: string;
  email: string;
  password: string;
}): FieldErrors<RegistrationField> {
  const errors: FieldErrors<RegistrationField> = {};
  const name = input.name.trim();
  if (name.length === 0) errors.name = 'Enter your name.';
  else if (name.length > NAME_MAX_LENGTH) {
    errors.name = `Use a name of at most ${NAME_MAX_LENGTH} characters.`;
  }

  const emailProblem = emailProblemOf(input.email);
  if (emailProblem) errors.email = emailProblem;

  if (input.password.length < REGISTRATION_PASSWORD_MIN_LENGTH) {
    errors.password = `Use at least ${REGISTRATION_PASSWORD_MIN_LENGTH} characters.`;
  } else if (input.password.length > PASSWORD_MAX_LENGTH) {
    errors.password = `Use at most ${PASSWORD_MAX_LENGTH} characters.`;
  }
  return errors;
}

export function validateLogin(input: { email: string; password: string }): FieldErrors<LoginField> {
  const errors: FieldErrors<LoginField> = {};
  const emailProblem = emailProblemOf(input.email);
  if (emailProblem) errors.email = emailProblem;

  if (input.password.length === 0) errors.password = 'Enter your password.';
  else if (input.password.length > PASSWORD_MAX_LENGTH) {
    errors.password = `Passwords are at most ${PASSWORD_MAX_LENGTH} characters.`;
  }
  return errors;
}
