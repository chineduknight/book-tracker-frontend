import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Loan } from '@/lib/lending/types';
import { CopyLoanStatus } from './copy-loan-status';
import { LoanStateBadge } from './loan-display';
import { LoanEditor } from './loan-editor';
import { NewLoanForm } from './new-loan-form';

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/lib/navigation/hard-navigation', () => ({ navigateTo: vi.fn(), replaceWith: vi.fn() }));

const NOW = '2026-11-15T10:00:00.000Z';
const loan: Loan = {
  id: 'a'.repeat(24),
  copyId: 'c'.repeat(24),
  bookId: 'b'.repeat(24),
  borrowerName: 'Ada',
  lentOn: '2026-03-01',
  dueOn: '2026-03-15',
  returnedOn: null,
  createdAt: NOW,
  updatedAt: NOW,
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  router.push.mockReset();
  router.replace.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

const writes = () => fetchMock.mock.calls.filter(([, init]) => init?.method !== 'GET');
const bodyOf = (index = 0) => JSON.parse(writes()[index]![1].body);

function unloadPrevented() {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

describe('LoanStateBadge', () => {
  it('says overdue in words, with the due day for screen readers, only against a reference day', () => {
    const { rerender } = render(<LoanStateBadge loan={loan} asOf="2026-03-16" />);
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(screen.getByText(', due 15 Mar 2026')).toHaveClass('sr-only');
    rerender(<LoanStateBadge loan={loan} asOf="2026-03-15" />);
    expect(screen.getByText('On loan')).toBeInTheDocument();
    rerender(<LoanStateBadge loan={loan} />);
    expect(screen.getByText('On loan')).toBeInTheDocument();
    rerender(<LoanStateBadge loan={{ ...loan, returnedOn: '2026-03-20' }} asOf="2026-04-01" />);
    expect(screen.getByText('Returned')).toBeInTheDocument();
  });
});

describe('NewLoanForm', () => {
  it('records exactly what was entered, with no invented dates, including text typed before hydration', async () => {
    fetchMock.mockResolvedValue(json(201, { data: loan }));
    const { container } = render(<NewLoanForm copyId={loan.copyId} bookId={loan.bookId} />);
    (container.querySelector('input[name="borrowerName"]') as HTMLInputElement).value = ' Ada ';
    (container.querySelector('input[name="lentOn"]') as HTMLInputElement).value = '2028-02-29';
    fireEvent.submit(container.querySelector('form')!);
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]![0]).toBe(`/api/lending/copies/${loan.copyId}/loans`);
    expect(bodyOf()).toEqual({ borrowerName: 'Ada', lentOn: '2028-02-29' });
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(`/lending/${loan.id}?notice=loan-created`),
    );
  });

  it('refuses a missing lent day and a due day before it, sending nothing', async () => {
    const user = userEvent.setup();
    render(<NewLoanForm copyId={loan.copyId} bookId={loan.bookId} />);
    await user.type(screen.getByLabelText('Borrower'), 'Ada');
    await user.type(screen.getByLabelText('Due back (optional)'), '2026-03-01');
    await user.click(screen.getByRole('button', { name: 'Record loan' }));
    expect(await screen.findByText('Enter the day you lent it.')).toBeInTheDocument();
    expect(screen.getByLabelText('Lent on')).toHaveFocus();
    await user.type(screen.getByLabelText('Lent on'), '2026-03-02');
    await user.click(screen.getByRole('button', { name: 'Record loan' }));
    expect(
      await screen.findByText('The due date can’t be before the lent date.'),
    ).toBeInTheDocument();
    expect(writes()).toHaveLength(0);
  });

  it('links to the loan recorded meanwhile, keeping the text', async () => {
    fetchMock
      .mockResolvedValueOnce(
        json(409, {
          error: {
            code: 'COPY_ALREADY_ON_LOAN',
            message: 'This copy is already lent. Check its current loan before recording another.',
          },
        }),
      )
      .mockResolvedValueOnce(
        json(200, { data: { copyId: loan.copyId, isOnLoan: true, activeLoan: loan } }),
      );
    const user = userEvent.setup();
    render(<NewLoanForm copyId={loan.copyId} bookId={loan.bookId} />);
    await user.type(screen.getByLabelText('Borrower'), 'Grace');
    await user.type(screen.getByLabelText('Lent on'), '2026-03-02');
    await user.click(screen.getByRole('button', { name: 'Record loan' }));
    expect(await screen.findByRole('link', { name: 'Open the current loan' })).toHaveAttribute(
      'href',
      `/lending/${loan.id}`,
    );
    expect(screen.getByLabelText('Borrower')).toHaveValue('Grace');
    expect(writes()).toHaveLength(1);
  });

  it('says it could not confirm an unanswered create and never retries it', async () => {
    fetchMock.mockRejectedValue(new TypeError('network down'));
    const user = userEvent.setup();
    render(<NewLoanForm copyId={loan.copyId} bookId={loan.bookId} />);
    await user.type(screen.getByLabelText('Borrower'), 'Grace');
    await user.type(screen.getByLabelText('Lent on'), '2026-03-02');
    await user.click(screen.getByRole('button', { name: 'Record loan' }));
    expect(
      await screen.findByText('Avuneri couldn’t confirm whether the loan was saved.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Check this copy’s loans/ })).toHaveAttribute(
      'href',
      `/lending/copies/${loan.copyId}`,
    );
    expect(writes()).toHaveLength(1);
    expect(screen.getByLabelText('Borrower')).toHaveValue('Grace');
  });
});

describe('LoanEditor', () => {
  function editor(value: Loan = loan) {
    render(
      <>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- what Link renders */}
        <a href="/lending">Lending</a>
        <LoanEditor loan={value} />
      </>,
    );
  }

  async function openReturn(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Mark returned…' }));
    return screen.getByRole('dialog', { name: 'Mark this loan as returned?' });
  }

  it('sends no PATCH when nothing changed', async () => {
    const user = userEvent.setup();
    editor();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('No changes to save.')).toBeInTheDocument();
    expect(writes()).toHaveLength(0);
  });

  it('clears an optional field with null', async () => {
    fetchMock.mockResolvedValue(json(200, { data: loan }));
    const user = userEvent.setup();
    editor();
    await user.clear(screen.getByLabelText('Due back (optional)'));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(bodyOf()).toEqual({ dueOn: null });
  });

  it('records a return with exactly the chosen day, and requires one', async () => {
    fetchMock.mockResolvedValue(json(200, { data: { ...loan, returnedOn: '2026-03-10' } }));
    const user = userEvent.setup();
    editor();
    const dialog = await openReturn(user);
    await user.click(within(dialog).getByRole('button', { name: 'Mark returned' }));
    expect(await within(dialog).findByText('Enter the day it came back.')).toBeInTheDocument();
    expect(writes()).toHaveLength(0);
    await user.type(within(dialog).getByLabelText('Returned on'), '2026-03-10');
    await user.click(within(dialog).getByRole('button', { name: 'Mark returned' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]![0]).toBe(`/api/lending/loans/${loan.id}/return`);
    expect(writes()[0]![1].method).toBe('PUT');
    expect(bodyOf()).toEqual({ returnedOn: '2026-03-10' });
    expect(router.replace).toHaveBeenCalledWith(`/lending/${loan.id}?notice=loan-returned`, {
      scroll: false,
    });
  });

  it('reports a return recorded elsewhere on another day, without retrying', async () => {
    fetchMock.mockResolvedValue(
      json(409, {
        error: {
          code: 'LOAN_ALREADY_RETURNED',
          message:
            'This loan was returned on a different date. To correct the recorded date, edit this returned loan.',
        },
      }),
    );
    const user = userEvent.setup();
    editor();
    const dialog = await openReturn(user);
    await user.type(within(dialog).getByLabelText('Returned on'), '2026-03-10');
    await user.click(within(dialog).getByRole('button', { name: 'Mark returned' }));
    expect(await within(dialog).findByText(/returned on a different date/)).toBeInTheDocument();
    expect(writes()).toHaveLength(1);
  });

  describe.each(['Cancel', 'Escape'] as const)('cancelling the return with %s', (method) => {
    async function cancel(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
      if (method === 'Cancel')
        await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      else fireEvent(dialog, new Event('cancel', { bubbles: false, cancelable: true }));
    }

    it('discards the pending day and clears the unsaved-changes guard', async () => {
      const user = userEvent.setup();
      editor();
      const dialog = await openReturn(user);
      await user.type(within(dialog).getByLabelText('Returned on'), '2026-03-10');
      expect(unloadPrevented()).toBe(true);
      await cancel(user, dialog);
      expect(unloadPrevented()).toBe(false);
      const reopened = await openReturn(user);
      expect(within(reopened).getByLabelText('Returned on')).toHaveValue('');
    });

    it('keeps other unsaved edits, their warning, and holds the return until they are saved', async () => {
      const user = userEvent.setup();
      editor();
      await user.type(screen.getByLabelText('Note (optional)'), 'Lent with a bookmark');
      const dialog = await openReturn(user);
      expect(within(dialog).getByText(/You have unsaved changes to this loan/)).toBeInTheDocument();
      await user.type(within(dialog).getByLabelText('Returned on'), '2026-03-10');
      await user.click(within(dialog).getByRole('button', { name: 'Mark returned' }));
      expect(
        await within(dialog).findByText(/Save or undo your other changes first/),
      ).toBeInTheDocument();
      expect(writes()).toHaveLength(0);
      await cancel(user, dialog);
      expect(screen.getByLabelText('Note (optional)')).toHaveValue('Lent with a bookmark');
      expect(unloadPrevented()).toBe(true);
      await user.click(screen.getByRole('link', { name: 'Lending' }));
      expect(screen.getByRole('dialog', { name: 'Discard unsaved changes?' })).toBeInTheDocument();
    });
  });

  it('corrects a returned loan’s day by PATCH and never offers to return or reopen it', async () => {
    fetchMock.mockResolvedValue(json(200, { data: loan }));
    const user = userEvent.setup();
    editor({ ...loan, returnedOn: '2026-03-10' });
    expect(screen.queryByRole('button', { name: 'Mark returned…' })).toBeNull();
    const day = screen.getByLabelText('Returned on');
    await user.clear(day);
    await user.type(day, '2026-03-12');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]![1].method).toBe('PATCH');
    expect(bodyOf()).toEqual({ returnedOn: '2026-03-12' });
  });
});

describe('CopyLoanStatus', () => {
  it('checks on demand and never calls a failed check "available"', async () => {
    fetchMock.mockResolvedValueOnce(
      json(503, { error: { code: 'SERVICE_UNAVAILABLE', message: 'x' } }),
    );
    const user = userEvent.setup();
    render(<CopyLoanStatus copyId={loan.copyId} copyLabel="Paperback #cccccc" />);
    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole('button', { name: 'Check loan status of Paperback #cccccc' }),
    );
    expect(await screen.findByText(/Couldn’t check whether it’s on loan/)).toBeInTheDocument();
    expect(screen.queryByText(/Not on loan/)).toBeNull();
    expect(screen.queryByRole('link', { name: 'Lend this copy' })).toBeNull();

    fetchMock.mockResolvedValueOnce(
      json(200, { data: { copyId: loan.copyId, isOnLoan: true, activeLoan: loan } }),
    );
    await user.click(screen.getByRole('button', { name: /Check loan status/ }));
    expect(await screen.findByText(/On loan to Ada since 1 Mar 2026/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View loan' })).toHaveAttribute(
      'href',
      `/lending/${loan.id}`,
    );
  });
});
