import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useBffAction } from '@/components/library/use-bff-action';
import { mockSession, mockLengths } from '@/lib/reading/__mocks__/session';
import { SessionEditor } from './session-editor';

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/components/library/use-bff-action');
const mockSend = vi.fn();

beforeEach(() => {
  mockSend.mockReset().mockResolvedValue({
    ok: true,
    data: { ...mockSession, status: 'completed' },
  });
  vi.mocked(useBffAction).mockReturnValue({
    send: mockSend,
    isPending: false,
    error: null,
    setError: vi.fn(),
  });
});

function editor() {
  render(
    <>
      <a href="/library">Library</a>
      <SessionEditor session={mockSession} lengths={mockLengths} />
    </>,
  );
}

async function openFinish(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Mark as finished…' }));
  return screen.getByRole('dialog', { name: 'Mark this reading as finished?' });
}

function expectUnloadPrevented(prevented: boolean) {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(prevented);
}

describe.each(['Cancel', 'Escape'] as const)('cancelling with %s', (method) => {
  async function cancel(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
    if (method === 'Cancel')
      await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    else fireEvent(dialog, new Event('cancel', { bubbles: false, cancelable: true }));
  }

  it('discards the date, clears the guard and finishes without a date on reopening', async () => {
    const user = userEvent.setup();
    editor();
    const dialog = await openFinish(user);
    await user.type(within(dialog).getByLabelText('Finished on (optional)'), '2023-02-01');
    expectUnloadPrevented(true);
    await cancel(user, dialog);
    expectUnloadPrevented(false);
    // Prevent jsdom's unimplemented navigation after observing the capture-phase guard.
    const link = screen.getByRole('link', { name: 'Library' });
    link.addEventListener('click', (event) => event.preventDefault(), { once: true });
    await user.click(link);
    expect(screen.queryByRole('dialog', { name: 'Discard unsaved changes?' })).toBeNull();
    const reopened = await openFinish(user);
    expect(within(reopened).getByLabelText('Finished on (optional)')).toHaveValue('');
    await user.click(within(reopened).getByRole('button', { name: 'Mark as finished' }));
    await waitFor(() =>
      expect(mockSend).toHaveBeenCalledExactlyOnceWith(
        'PATCH',
        `/api/reading/sessions/${mockSession.id}`,
        { status: 'completed' },
      ),
    );
  });

  it('preserves other unsaved edits and their navigation warning', async () => {
    const user = userEvent.setup();
    editor();
    await user.type(screen.getByLabelText('Summary (optional)'), 'Keep my thoughts');
    const dialog = await openFinish(user);
    await user.type(within(dialog).getByLabelText('Finished on (optional)'), '2023-02-01');
    await cancel(user, dialog);
    expect(screen.getByLabelText('Summary (optional)')).toHaveValue('Keep my thoughts');
    expectUnloadPrevented(true);
    await user.click(screen.getByRole('link', { name: 'Library' }));
    expect(screen.getByRole('dialog', { name: 'Discard unsaved changes?' })).toBeInTheDocument();
    expect(mockSend).not.toHaveBeenCalled();
  });
});

it('sends an explicitly confirmed finish date', async () => {
  const user = userEvent.setup();
  editor();
  const dialog = await openFinish(user);
  await user.type(within(dialog).getByLabelText('Finished on (optional)'), '2023-02-01');
  await user.click(within(dialog).getByRole('button', { name: 'Mark as finished' }));
  await waitFor(() =>
    expect(mockSend).toHaveBeenCalledExactlyOnceWith(
      'PATCH',
      `/api/reading/sessions/${mockSession.id}`,
      { status: 'completed', completedOn: '2023-02-01' },
    ),
  );
});
