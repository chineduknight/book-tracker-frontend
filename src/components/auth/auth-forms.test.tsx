import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RegisterForm } from './register-form';
import { SignInForm } from './sign-in-form';

const navigation = vi.hoisted(() => ({ navigateTo: vi.fn(), replaceWith: vi.fn() }));
vi.mock('@/lib/navigation/hard-navigation', () => navigation);

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  navigation.navigateTo.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function fillSignIn(email: string, password: string) {
  const user = userEvent.setup();
  if (email) await user.type(screen.getByLabelText('Email'), email);
  if (password) await user.type(screen.getByLabelText('Password'), password);
  return user;
}

describe('SignInForm', () => {
  it('validates locally, marks fields invalid and focuses the first problem', async () => {
    render(<SignInForm returnPath="/" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    const email = screen.getByLabelText('Email');
    expect(email).toHaveFocus();
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAccessibleDescription('Enter your email address.');
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription('Enter your password.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('clears a field error as soon as it is corrected', async () => {
    render(<SignInForm returnPath="/" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid');
  });

  it('submits with Enter, sends JSON to the session API and opens the return page', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { data: { user: { name: 'Ada', email: 'ada@example.com' } } }),
    );
    render(<SignInForm returnPath="/library" />);
    const user = await fillSignIn('ada@example.com', 'secret passphrase');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(navigation.navigateTo).toHaveBeenCalledWith('/library'));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/session/login');
    expect(init).toMatchObject({ method: 'POST', credentials: 'same-origin', cache: 'no-store' });
    expect(JSON.parse(init.body)).toEqual({
      email: 'ada@example.com',
      password: 'secret passphrase',
    });
  });

  it('shows a busy state and submits only once while waiting', async () => {
    let answer: (response: Response) => void = () => {};
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => (answer = resolve)));
    render(<SignInForm returnPath="/" />);
    const user = await fillSignIn('ada@example.com', 'secret passphrase');

    const button = screen.getByRole('button', { name: 'Sign in' });
    await user.click(button);
    expect(button).toHaveTextContent('Signing in…');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Signing in…');
    await user.click(button);
    await user.keyboard('{Enter}');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () =>
      answer(jsonResponse(401, { error: { code: 'INVALID_CREDENTIALS', message: 'x' } })),
    );
    expect(button).toHaveTextContent('Sign in');
  });

  it('announces and focuses wrong credentials without clearing the email', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(401, { error: { code: 'INVALID_CREDENTIALS', message: 'x' } }),
    );
    render(<SignInForm returnPath="/" />);
    const user = await fillSignIn('ada@example.com', 'wrong passphrase');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Email or password is incorrect.');
    expect(alert.parentElement).toHaveFocus();
    expect(screen.getByLabelText('Email')).toHaveValue('ada@example.com');
    expect(navigation.navigateTo).not.toHaveBeenCalled();
  });

  it('explains rate limiting with the wait time', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(429, { error: { code: 'RATE_LIMITED', message: 'x', retryAfterSeconds: 300 } }),
    );
    render(<SignInForm returnPath="/" />);
    const user = await fillSignIn('ada@example.com', 'secret passphrase');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wait about 5 minutes');
  });

  it('distinguishes an unreachable service from wrong credentials', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    render(<SignInForm returnPath="/" />);
    const user = await fillSignIn('ada@example.com', 'secret passphrase');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('can’t be reached');
    expect(alert).not.toHaveTextContent('incorrect');
  });

  it('lets the password be shown and hidden', async () => {
    render(<SignInForm returnPath="/" />);
    const user = userEvent.setup();
    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    await user.click(toggle);
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeInTheDocument();
  });

  it('uses the right autocomplete hints', () => {
    render(<SignInForm returnPath="/" />);
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'email');
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password');
  });
});

describe('RegisterForm', () => {
  async function fillRegistration(password: string) {
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Name'), 'Ada Lovelace');
    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText(/^Password/), password);
    return user;
  }

  it('states the password policy and enforces it before sending', async () => {
    render(<RegisterForm returnPath="/" />);
    const password = screen.getByLabelText(/^Password/);
    expect(password).toHaveAccessibleDescription(/12 to 128 characters/);
    expect(password).toHaveAttribute('autocomplete', 'new-password');

    const user = await fillRegistration('too short');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(password).toHaveFocus();
    expect(password).toHaveAccessibleDescription(/Use at least 12 characters/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the password exactly as typed', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { data: { user: { name: 'Ada', email: 'a' } } }));
    render(<RegisterForm returnPath="/" />);
    const user = await fillRegistration('  spaced passphrase  ');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(navigation.navigateTo).toHaveBeenCalledWith('/'));
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).password).toBe('  spaced passphrase  ');
  });

  it('puts a taken email on the email field', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(409, {
        error: {
          code: 'EMAIL_TAKEN',
          message: 'x',
          fields: [{ field: 'email', message: 'An account with this email already exists.' }],
        },
      }),
    );
    render(<RegisterForm returnPath="/" />);
    const user = await fillRegistration('a long enough passphrase');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('already exists');
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('maps server validation details onto fields and focuses the first', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'x',
          fields: [{ field: 'name', message: 'Enter a name of 1 to 100 characters.' }],
        },
      }),
    );
    render(<RegisterForm returnPath="/" />);
    const user = await fillRegistration('a long enough passphrase');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveFocus());
    expect(screen.getByLabelText('Name')).toHaveAccessibleDescription(
      'Enter a name of 1 to 100 characters.',
    );
  });
});
