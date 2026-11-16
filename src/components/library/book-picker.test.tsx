import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Book } from '@/lib/library/types';
import { BookPicker } from './book-picker';

const NOW = '2026-11-15T10:00:00.000Z';
const books: Book[] = Array.from({ length: 25 }, (_, index) => ({
  id: index.toString(16).padStart(24, '0'),
  title: 'Middlemarch',
  authors: ['George Eliot'],
  format: 'physical',
  edition: `Edition ${index + 1}`,
  createdAt: NOW,
  updatedAt: NOW,
}));

function pageOf(page: number) {
  const items = books.slice((page - 1) * 20, page * 20);
  return new Response(
    JSON.stringify({ data: { items, pagination: { page, limit: 20, total: 25, totalPages: 2 } } }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async (url: string) =>
    pageOf(new URL(url, 'http://x').searchParams.get('page') === '2' ? 2 : 1),
  );
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('BookPicker', () => {
  it('reaches books beyond the first page, even when the whole first page is excluded', async () => {
    const onChoose = vi.fn();
    render(
      <BookPicker
        label="Find a book to add"
        chooseLabel="Add"
        onChoose={onChoose}
        excludeIds={books.slice(0, 20).map((book) => book.id)}
        excludedReason="already in this collection"
      />,
    );

    expect(
      await screen.findByText(
        /Showing 20 of 25 books\. 20 shown so far are already in this collection\./,
      ),
    ).toBeVisible();
    expect(screen.queryByText(/no other books/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Add Middlemarch/ })).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Load more books' }));
    await screen.findByText(/Showing 25 of 25 books/);
    expect(screen.queryByRole('button', { name: 'Load more books' })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/library/books',
      '/api/library/books?page=2',
    ]);

    await user.click(
      screen.getByRole('button', { name: 'Add Middlemarch, Physical · Edition 21' }),
    );
    expect(onChoose).toHaveBeenCalledWith(books[20]);
  });

  it('tells editions of the same title apart', async () => {
    render(<BookPicker label="Find" chooseLabel="Choose" onChoose={vi.fn()} />);
    expect(
      await screen.findByRole('button', { name: 'Choose Middlemarch, Physical · Edition 1' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Choose Middlemarch, Physical · Edition 2' }),
    ).toBeVisible();
  });

  it('only says there is nothing to choose once every page has been read', async () => {
    render(
      <BookPicker
        label="Find"
        chooseLabel="Add"
        onChoose={vi.fn()}
        excludeIds={books.map((book) => book.id)}
      />,
    );
    await screen.findByText(/Showing 20 of 25/);
    expect(screen.queryByText(/no other books to choose/)).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Load more books' }));
    expect(await screen.findByText(/There are no other books to choose\./)).toBeVisible();
  });

  it('starts again from page 1 for a new search', async () => {
    const user = userEvent.setup();
    render(<BookPicker label="Find a book" chooseLabel="Add" onChoose={vi.fn()} />);
    await screen.findByText(/Showing 20 of 25/);
    await user.click(screen.getByRole('button', { name: 'Load more books' }));
    await screen.findByText(/Showing 25 of 25/);
    await user.type(screen.getByLabelText('Find a book'), 'eliot');
    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith('/api/library/books?q=eliot', expect.anything()),
    );
    expect(await screen.findByText(/Showing 20 of 25 matching books/)).toBeVisible();
  });
});
