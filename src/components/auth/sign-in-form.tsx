'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PASSWORD_MAX_LENGTH, validateLogin, type LoginField } from '@/lib/auth/credential-policy';
import { SESSION_API } from '@/lib/auth/session-api';
import { FormError } from './form-error';
import { PasswordInput } from './password-input';
import { useSessionForm } from './use-session-form';

const FIELDS = ['email', 'password'] as const satisfies readonly LoginField[];

export function SignInForm({ returnPath }: { returnPath: string }) {
  const [values, setValues] = useState<Record<LoginField, string>>({ email: '', password: '' });
  const form = useSessionForm({
    endpoint: SESSION_API.login,
    fields: FIELDS,
    validate: validateLogin,
    returnPath,
  });

  function update(field: LoginField, value: string) {
    const next = { ...values, [field]: value };
    setValues(next);
    form.revalidate(field, next);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void form.submit(values);
  }

  return (
    <form noValidate onSubmit={onSubmit} aria-busy={form.isBusy} className="flex flex-col gap-5">
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
        value={values.email}
        error={form.fieldErrors.email}
        onChange={(event) => update('email', event.target.value)}
      />
      <PasswordInput
        ref={form.registerInput('password')}
        label="Password"
        name="password"
        autoComplete="current-password"
        maxLength={PASSWORD_MAX_LENGTH}
        required
        value={values.password}
        error={form.fieldErrors.password}
        onChange={(event) => update('password', event.target.value)}
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
