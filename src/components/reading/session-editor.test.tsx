import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SessionEditor } from './session-editor';
import { mockSession, mockLengths } from '@/lib/reading/__mocks__/session';
import { useBffAction } from '@/components/library/use-bff-action';

// Mock the BFF action hook
jest.mock('@/components/library/use-bff-action');
const mockSend = jest.fn().mockResolvedValue({ ok: true });
(useBffAction as jest.Mock).mockReturnValue({
  send: mockSend,
  isPending: false,
  error: null,
  setError: jest.fn(),
});

test('cancelling finish date clears the input on reopen', async () => {
  render(<SessionEditor session={mockSession} lengths={mockLengths} />);

  // Open the finish dialog
  fireEvent.click(screen.getByRole('button', { name: /Mark as finished/i }));
  const dateInput = screen.getByLabelText(/Finished on/i) as HTMLInputElement;
  fireEvent.change(dateInput, { target: { value: '2023-01-01' } });
  expect(dateInput.value).toBe('2023-01-01');

  // Cancel the dialog
  fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));

  // Re‑open the dialog
  fireEvent.click(screen.getByRole('button', { name: /Mark as finished/i }));
  const reopenedInput = screen.getByLabelText(/Finished on/i) as HTMLInputElement;
  expect(reopenedInput.value).toBe(''); // cleared
});

test('confirming without a date sends no completedOn field', async () => {
  render(<SessionEditor session={mockSession} lengths={mockLengths} />);

  // Open the finish dialog and confirm without typing a date
  fireEvent.click(screen.getByRole('button', { name: /Mark as finished/i }));
  fireEvent.click(screen.getByRole('button', { name: /Mark as finished/i })); // confirm

  await waitFor(() => expect(mockSend).toHaveBeenCalled());

  const payload = mockSend.mock.calls[0][2]; // third arg is the changes object
  expect(payload.completedOn).toBeUndefined();
});
