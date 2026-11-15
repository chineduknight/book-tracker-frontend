import { describe, expect, it } from 'vitest';
import { normalizeEmail, validateLogin, validateRegistration } from './credential-policy';

const valid = { name: 'Ada Lovelace', email: 'ada@example.com', password: 'correct horse battery' };

describe('validateRegistration', () => {
  it('accepts valid details', () => {
    expect(validateRegistration(valid)).toEqual({});
  });

  it('trims the name but never the password', () => {
    expect(validateRegistration({ ...valid, name: '   ' })).toEqual({ name: 'Enter your name.' });
    expect(validateRegistration({ ...valid, password: '   eleven   ' })).toEqual({});
    expect(validateRegistration({ ...valid, password: ' 10 chars ' }).password).toMatch(/12/);
  });

  it('enforces the backend length limits', () => {
    expect(validateRegistration({ ...valid, name: 'n'.repeat(100) })).toEqual({});
    expect(validateRegistration({ ...valid, name: 'n'.repeat(101) }).name).toMatch(/100/);
    expect(validateRegistration({ ...valid, password: 'p'.repeat(128) })).toEqual({});
    expect(validateRegistration({ ...valid, password: 'p'.repeat(129) }).password).toMatch(/128/);
    expect(validateRegistration({ ...valid, password: 'p'.repeat(11) }).password).toMatch(/12/);
  });

  it('checks the email shape and length', () => {
    expect(validateRegistration({ ...valid, email: 'not-an-email' }).email).toBeDefined();
    expect(validateRegistration({ ...valid, email: '' }).email).toBe('Enter your email address.');
    const long = `${'a'.repeat(250)}@x.io`;
    expect(validateRegistration({ ...valid, email: long }).email).toMatch(/254/);
  });
});

describe('validateLogin', () => {
  it('needs an email and a password of at most 128 characters', () => {
    expect(validateLogin({ email: 'ada@example.com', password: 'x' })).toEqual({});
    expect(validateLogin({ email: '', password: '' })).toEqual({
      email: 'Enter your email address.',
      password: 'Enter your password.',
    });
    expect(validateLogin({ email: 'ada@example.com', password: 'p'.repeat(129) }).password).toMatch(
      /128/,
    );
  });
});

describe('normalizeEmail', () => {
  it('trims and lowercases like the backend', () => {
    expect(normalizeEmail('  Ada@Example.COM ')).toBe('ada@example.com');
  });
});
