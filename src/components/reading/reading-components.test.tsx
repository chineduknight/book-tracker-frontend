import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReadingSession } from '@/lib/reading/types';
import { describeDates, describeProgress, sessionName } from './reading-display';
import { SessionEditor } from './session-editor';
import { StartReadingForm } from './start-reading-form';

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/lib/navigation/hard-navigation', () => ({ navigateTo: vi.fn(), replaceWith: vi.fn() }));

const NOW = '2026-11-15T10:00:00.000Z';
const BOOK_ID = 'b'.repeat(24);
const session: ReadingSession = {
  id: 'a'.repeat(24),
  bookId: BOOK_ID,
  status: 'in_progress',
  progress: { unit: 'pages', value: 120 },
  startedOn: '2026-03-01',
  createdAt: NOW,
  updatedAt: NOW,
};
const lengths = { pageCount: 300 };

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

describe('display', () => {
  it('describes progress with the book’s length only when known', () => {
    expect(describeProgress({ unit: 'pages', value: 12 }, lengths)).toBe('Page 12 of 300');
    expect(describeProgress({ unit: 'chapters', value: 3 })).toBe('Chapter 3');
    expect(describeProgress({ unit: 'percent', value: 100 })).toBe('100%');
    expect(describeProgress(null)).toBe('No progress recorded');
  });

  it('shows only entered dates, exactly, and names readings distinctly', () => {
    expect(describeDates({ ...session, startedOn: '2028-02-29' })).toBe('Started 29 Feb 2028');
    expect(describeDates({ ...session, startedOn: undefined })).toBe('No dates recorded');
    expect(sessionName(session)).toBe('Reading in progress, started 1 Mar 2026 #aaaaaa');
    expect(sessionName({ ...session, startedOn: undefined, status: 'completed' })).toBe(
      'Finished reading, recorded 15 Nov 2026 #aaaaaa',
    );
  });
});

describe('SessionEditor', () => {
  it('sends no PATCH when nothing changed', async () => {
    const user = userEvent.setup();
    render(<SessionEditor session={session} lengths={lengths} />);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('No changes to save.')).toBeInTheDocument();
    expect(writes()).toHaveLength(0);
  });

  it('explains the book’s page count instead of sending progress beyond it', async () => {
    const user = userEvent.setup();
    render(<SessionEditor session={session} lengths={lengths} />);
    const amount = screen.getByLabelText('Amount');
    await user.clear(amount);
    await user.type(amount, '301');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(
      await screen.findByText('This book has 300 pages; enter at most 300.'),
    ).toBeInTheDocument();
    expect(amount).toHaveFocus();
    expect(writes()).toHaveLength(0);
  });

  it('saves the last page without finishing the reading', async () => {
    fetchMock.mockResolvedValue(json(200, { data: session }));
    const user = userEvent.setup();
    render(<SessionEditor session={session} lengths={lengths} />);
    const amount = screen.getByLabelText('Amount');
    await user.clear(amount);
    await user.type(amount, '300');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(bodyOf()).toEqual({ progress: { unit: 'pages', value: 300 } });
    expect(router.replace).toHaveBeenCalledWith(`/reading/${session.id}?notice=reading-saved`, {
      scroll: false,
    });
  });

  it('finishes only after confirming, with no date invented', async () => {
    fetchMock.mockResolvedValue(json(200, { data: { ...session, status: 'completed' } }));
    const user = userEvent.setup();
    render(<SessionEditor session={session} lengths={lengths} />);
    await user.click(screen.getByRole('button', { name: 'Mark as finished…' }));
    const dialog = screen.getByRole('dialog', { name: 'Mark this reading as finished?' });
    expect(writes()).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: 'Mark as finished' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(bodyOf()).toEqual({ status: 'completed' });
  });

  it('refuses a finish date before the start, inside the dialog', async () => {
    const user = userEvent.setup();
    render(<SessionEditor session={session} lengths={lengths} />);
    await user.click(screen.getByRole('button', { name: 'Mark as finished…' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Finished on (optional)'), '2026-02-01');
    await user.click(within(dialog).getByRole('button', { name: 'Mark as finished' }));
    expect(
      await within(dialog).findByText('The finish date can’t be before the start date.'),
    ).toBeInTheDocument();
    expect(writes()).toHaveLength(0);
  });

  it('keeps every field after a concurrent-update conflict, ready to save again', async () => {
    fetchMock.mockResolvedValue(
      json(409, {
        error: {
          code: 'READING_SESSION_UPDATE_CONFLICT',
          message: 'This reading was being changed somewhere else at the same time.',
        },
      }),
    );
    const user = userEvent.setup();
    render(<SessionEditor session={session} lengths={lengths} />);
    await user.type(screen.getByLabelText('Summary (optional)'), 'Long thoughts');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(
      await screen.findByText('This reading was being changed somewhere else at the same time.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Summary (optional)')).toHaveValue('Long thoughts');
  });

  it('never offers to finish or reopen a finished reading, but allows corrections', async () => {
    fetchMock.mockResolvedValue(json(200, { data: session }));
    const done: ReadingSession = { ...session, status: 'completed', completedOn: '2026-03-09' };
    const user = userEvent.setup();
    render(<SessionEditor session={done} lengths={lengths} />);
    expect(screen.queryByRole('button', { name: 'Mark as finished…' })).toBeNull();
    await user.clear(screen.getByLabelText('Finished on (optional)'));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(bodyOf()).toEqual({ completedOn: null });
  });
});

describe('StartReadingForm', () => {
  it('starts an in-progress reading with an empty body: the API’s defaults, no dates', async () => {
    fetchMock.mockResolvedValue(json(201, { data: session }));
    const user = userEvent.setup();
    render(<StartReadingForm bookId={BOOK_ID} lengths={lengths} activeSession={null} />);
    await user.click(screen.getByRole('button', { name: 'Start reading' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]![0]).toBe(`/api/reading/books/${BOOK_ID}/sessions`);
    expect(bodyOf()).toEqual({});
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(`/reading/${session.id}?notice=reading-started`),
    );
  });

  it('records a finished read in one request', async () => {
    fetchMock.mockResolvedValue(json(201, { data: { ...session, status: 'completed' } }));
    const user = userEvent.setup();
    render(<StartReadingForm bookId={BOOK_ID} lengths={lengths} activeSession={null} />);
    await user.click(screen.getByRole('radio', { name: /A read I’ve already finished/ }));
    await user.selectOptions(screen.getByLabelText('Rating (optional)'), '5');
    await user.click(screen.getByRole('button', { name: 'Record finished read' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(bodyOf()).toEqual({ status: 'completed', rating: 5 });
  });

  it('sends a reader to the reading started elsewhere instead of creating a duplicate', async () => {
    fetchMock
      .mockResolvedValueOnce(
        json(409, {
          error: {
            code: 'READING_SESSION_IN_PROGRESS',
            message: 'You’re already reading this book.',
          },
        }),
      )
      .mockResolvedValueOnce(
        json(200, {
          data: {
            bookId: BOOK_ID,
            status: 'reading',
            totalSessions: 1,
            completedSessions: 0,
            activeSession: session,
            lastCompletedSession: null,
          },
        }),
      );
    const user = userEvent.setup();
    render(<StartReadingForm bookId={BOOK_ID} lengths={lengths} activeSession={null} />);
    await user.click(screen.getByRole('button', { name: 'Start reading' }));
    const link = await screen.findByRole('link', { name: /Continue your current reading/ });
    expect(link).toHaveAttribute('href', `/reading/${session.id}`);
    expect(writes()).toHaveLength(1);
  });

  it('offers only a finished read while one is in progress', () => {
    render(<StartReadingForm bookId={BOOK_ID} lengths={lengths} activeSession={session} />);
    expect(screen.getByRole('radio', { name: /Start reading now/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /already finished/ })).toBeChecked();
  });
});
