'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  REGISTRATION_PASSWORD_MIN_LENGTH,
  validateRegistration,
  type RegistrationField,
} from '@/lib/auth/credential-policy';
import { SESSION_API } from '@/lib/auth/session-api';
import { FormError } from './form-error';
import { PasswordInput } from './password-input';
import { useSessionForm } from './use-session-form';

const FIELDS = ['name', 'email', 'password'] as const satisfies readonly RegistrationField[];

export function RegisterForm({ returnPath }: { returnPath: string }) {
  const [values, setValues] = useState<Record<RegistrationField, string>>({
    name: '',
    email: '',
    password: '',
  });
  const form = useSessionForm({
    endpoint: SESSION_API.register,
    fields: FIELDS,
    validate: validateRegistration,
    returnPath,
  });

  function update(field: RegistrationField, value: string) {
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
        ref={form.registerInput('name')}
        label="Name"
        name="name"
        autoComplete="name"
        maxLength={NAME_MAX_LENGTH}
        required
        value={values.name}
        error={form.fieldErrors.name}
        onChange={(event) => update('name', event.target.value)}
      />
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
        hint={`${REGISTRATION_PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters. A few unrelated words make a strong, memorable passphrase.`}
        autoComplete="new-password"
        maxLength={PASSWORD_MAX_LENGTH}
        required
        value={values.password}
        error={form.fieldErrors.password}
        onChange={(event) => update('password', event.target.value)}
      />
      <Button type="submit" aria-disabled={form.isBusy} className="mt-1 w-full">
        {form.isBusy ? 'Creating your account…' : 'Create account'}
      </Button>
      <p role="status" className="sr-only">
        {form.status === 'submitting' ? 'Creating your account…' : ''}
        {form.status === 'redirecting' ? 'Account created. Opening your library…' : ''}
      </p>
    </form>
  );
}
