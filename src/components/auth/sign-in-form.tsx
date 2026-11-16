'use client';

import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { readFormValues } from '@/lib/forms/read-form-values';
import { PASSWORD_MAX_LENGTH, validateLogin, type LoginField } from '@/lib/auth/credential-policy';
import { SESSION_API } from '@/lib/auth/session-api';
import { FormError } from './form-error';
import { PasswordInput } from './password-input';
import { useSessionForm } from './use-session-form';

const FIELDS = ['email', 'password'] as const satisfies readonly LoginField[];
const EMPTY: Record<LoginField, string> = { email: '', password: '' };

/**
 * Uncontrolled fields: React never overwrites what the reader typed, including text entered before
 * the page became interactive. Values are read from the form when needed.
 */
export function SignInForm({ returnPath }: { returnPath: string }) {
  const form = useSessionForm({
    endpoint: SESSION_API.login,
    fields: FIELDS,
    validate: validateLogin,
    returnPath,
  });

  return (
    <form
      noValidate
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        void form.submit(readFormValues(event.currentTarget, EMPTY));
      }}
      onChange={(event) => {
        const changed: EventTarget = event.target;
        const field = FIELDS.find(
          (name) => changed instanceof HTMLInputElement && changed.name === name,
        );
        if (field) form.revalidate(field, readFormValues(event.currentTarget, EMPTY));
      }}
      aria-busy={form.isBusy}
      className="flex flex-col gap-5"
    >
      <FormError error={form.formError} errorRef={form.formErrorRef} />
      <Input
        ref={form.registerInput('email')}
        label="Email"
        type="email"
        name="email"
        autoComplete="email"
        inputMode="email"
        autoCapitalize="none"
        spellCheck={false}
        required
        error={form.fieldErrors.email}
      />
      <PasswordInput
        ref={form.registerInput('password')}
        label="Password"
        name="password"
        autoComplete="current-password"
        maxLength={PASSWORD_MAX_LENGTH}
        required
        error={form.fieldErrors.password}
      />
      <Button type="submit" aria-disabled={form.isBusy} className="mt-1 w-full">
        {form.isBusy ? 'Signing in…' : 'Sign in'}
      </Button>
      <p role="status" className="sr-only">
        {form.status === 'submitting' ? 'Signing in…' : ''}
        {form.status === 'redirecting' ? 'Signed in. Opening your library…' : ''}
      </p>
    </form>
  );
}
