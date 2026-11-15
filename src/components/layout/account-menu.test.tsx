import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountMenu } from './account-menu';

const navigation = vi.hoisted(() => ({ navigateTo: vi.fn(), replaceWith: vi.fn() }));
vi.mock('@/lib/navigation/hard-navigation', () => navigation);

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  navigation.replaceWith.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderMenu() {
  render(
    <>
      <AccountMenu name="Ada Lovelace" email="ada@example.com" />
      <p>Outside</p>
    </>,
  );
  return screen.getByRole('button', { name: /Account: Ada Lovelace/ });
}

describe('AccountMenu', () => {
  it('shows only the name and email, and opens and closes from the keyboard', async () => {
    const toggle = renderMenu();
    const user = userEvent.setup();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument();

    toggle.focus();
    await user.keyboard('{Enter}');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('ada@example.com')).toBeVisible();

    await user.keyboard('{Escape}');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();
  });

  it('closes on a click outside', async () => {
    const toggle = renderMenu();
    const user = userEvent.setup();
    await user.click(toggle);
    await user.click(screen.getByText('Outside'));
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('logs out through the session API and leaves for the sign-in page', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: { backendSignOut: 'confirmed' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const user = userEvent.setup();
    await user.click(renderMenu());
    await user.click(screen.getByRole('button', { name: 'Log out' }));

    await waitFor(() => expect(navigation.replaceWith).toHaveBeenCalledWith('/login?signedOut=1'));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/session/logout',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('is honest when the server could not confirm the sign-out', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: { backendSignOut: 'unconfirmed' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const user = userEvent.setup();
    await user.click(renderMenu());
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    await waitFor(() =>
      expect(navigation.replaceWith).toHaveBeenCalledWith('/login?signedOut=unconfirmed'),
    );
  });

  it('stays signed in, and says so, when the app cannot be reached', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const user = userEvent.setup();
    await user.click(renderMenu());
    await user.click(screen.getByRole('button', { name: 'Log out' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('still signed in');
    expect(navigation.replaceWith).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Log out' })).toHaveAttribute(
      'aria-disabled',
      'false',
    );
  });
});
