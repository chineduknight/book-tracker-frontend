import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ActionError } from './action-error';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Book, PhysicalCopy } from '@/lib/library/types';
import { BookCover } from './book-cover';
import { BookForm } from './book-form';
import { copyAddedOn, copyName } from './copies-manager';

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
const navigation = vi.hoisted(() => ({ navigateTo: vi.fn(), replaceWith: vi.fn() }));
vi.mock('@/lib/navigation/hard-navigation', () => navigation);

const NOW = '2026-11-15T10:00:00.000Z';
const book: Book = {
  id: '665f1c2ab4e5d1a2b3c4d5e6',
  title: 'Middlemarch',
  authors: ['George Eliot'],
  format: 'physical',
  isbn: '9780141439549',
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
  navigation.navigateTo.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

const writes = () => fetchMock.mock.calls.filter(([, init]) => init?.method !== 'GET');

describe('BookForm', () => {
  it('creates with only filled fields and opens the new book', async () => {
    fetchMock.mockResolvedValue(json(201, { data: { ...book, id: 'a'.repeat(24) } }));
    const user = userEvent.setup();
    render(<BookForm />);
    await user.type(screen.getByLabelText('Title'), '  The   Waves ');
    await user.click(screen.getByRole('radio', { name: 'Ebook' }));
    await user.click(screen.getByRole('button', { name: 'Add book' }));

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(
        `/library/books/${'a'.repeat(24)}?notice=book-created`,
      ),
    );
    const [url, init] = writes()[0]!;
    expect(url).toBe('/api/library/books');
    expect(JSON.parse(init.body)).toEqual({ title: 'The Waves', format: 'ebook' });
  });

  it('keeps text typed before the page became interactive', async () => {
    fetchMock.mockResolvedValue(json(201, { data: { ...book, id: 'c'.repeat(24) } }));
    render(<BookForm />);
    (screen.getByLabelText('Title') as HTMLInputElement).value = 'Typed early';
    await userEvent.setup().click(screen.getByRole('button', { name: 'Add book' }));
    await waitFor(() => expect(router.push).toHaveBeenCalled());
    expect(JSON.parse(writes()[0]![1].body)).toEqual({ title: 'Typed early', format: 'physical' });
  });

  it('sends nothing when nothing changed', async () => {
    const user = userEvent.setup();
    render(<BookForm book={book} />);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByRole('status')).toHaveTextContent('No changes to save.');
    expect(writes()).toHaveLength(0);
  });

  it('clears a field with null and keeps edits through a format conflict', async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
      init?.method === 'PATCH'
        ? json(409, {
            error: {
              code: 'BOOK_HAS_PHYSICAL_COPIES',
              message: 'This book has (or once had) physical copies, so it cannot become an ebook.',
            },
          })
        : json(200, { data: [] }),
    );
    const user = userEvent.setup();
    render(<BookForm book={book} />);
    await user.clear(screen.getByLabelText('ISBN (optional)'));
    await user.type(screen.getByLabelText('Edition (optional)'), 'Penguin');
    await user.click(screen.getByRole('radio', { name: 'Ebook' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText(/cannot become an ebook/)).toBeVisible();
    expect(JSON.parse(writes()[0]![1].body)).toEqual({
      format: 'ebook',
      isbn: null,
      edition: 'Penguin',
    });
    expect(screen.getByRole('radio', { name: 'Ebook' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: /Keep it physical/ }));
    expect(screen.getByRole('radio', { name: 'Physical' })).toBeChecked();
    expect(screen.getByLabelText('Edition (optional)')).toHaveValue('Penguin');
    expect(router.push).not.toHaveBeenCalled();
  });

  it('shows field errors from validation without calling the BFF', async () => {
    const user = userEvent.setup();
    render(<BookForm />);
    const pages = screen.getByLabelText('Pages (optional)');
    await user.type(pages, 'many');
    expect(pages).toHaveValue(''); // letters never reach the field
    await user.type(pages, '0');
    await user.click(screen.getByRole('button', { name: 'Add book' }));
    expect(screen.getByLabelText('Title')).toHaveFocus();
    expect(screen.getByLabelText('Pages (optional)')).toHaveAccessibleDescription(/whole number/);
    expect(writes()).toHaveLength(0);
  });

  it('sends an ended session to sign-in', async () => {
    window.history.replaceState(null, '', '/library/new');
    fetchMock.mockResolvedValue(json(401, { error: { code: 'UNAUTHENTICATED', message: 'x' } }));
    const user = userEvent.setup();
    render(<BookForm />);
    await user.type(screen.getByLabelText('Title'), 'Late');
    await user.click(screen.getByRole('button', { name: 'Add book' }));
    await waitFor(() =>
      expect(navigation.navigateTo).toHaveBeenCalledWith('/login?next=%2Flibrary%2Fnew'),
    );
  });
});

describe('copyName', () => {
  const sameDay = (id: string, time: string): PhysicalCopy => ({
    id,
    bookId: book.id,
    locationId: null,
    createdAt: `2026-11-15T${time}.000Z`,
    updatedAt: NOW,
  });
  const first = sameDay('665f1c2ab4e5d1a2b3a10001', '09:00:00');
  const second = sameDay('665f1c2ab4e5d1a2b3a10002', '09:00:00');

  it('distinguishes unlabelled copies added the same day by a permanent reference', () => {
    expect(copyName(first)).toBe('Unlabelled copy #a10001');
    expect(copyName(second)).toBe('Unlabelled copy #a10002');
    expect(copyAddedOn(first)).toBe(copyAddedOn(second));
  });

  it('does not depend on list position, so adding a copy changes no name', () => {
    const third = sameDay('665f1c2ab4e5d1a2b3a10003', '09:30:00');
    const before = [second, first].map(copyName);
    const after = [third, second, first].map(copyName);
    expect(after.slice(1)).toEqual(before);
    expect(new Set(after).size).toBe(3);
  });

  it('keeps the reference next to a label, so copies with the same label differ too', () => {
    expect(copyName({ ...first, label: 'Paperback' })).toBe('Paperback #a10001');
    expect(copyName({ ...second, label: 'Paperback' })).toBe('Paperback #a10002');
  });
});

describe('ActionError', () => {
  it('takes focus when an error appears, and again for a new one', () => {
    const { rerender } = render(<ActionError error={null} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    rerender(<ActionError error={{ code: 'SERVICE_UNAVAILABLE', message: 'x' }} />);
    const alert = screen.getByRole('alert');
    expect(alert.parentElement).toHaveFocus();
    alert.parentElement!.blur();
    rerender(<ActionError error={{ code: 'RATE_LIMITED', message: 'x', retryAfterSeconds: 60 }} />);
    expect(screen.getByRole('alert').parentElement).toHaveFocus();
  });
});

describe('BookCover', () => {
  it('shows an https cover without sending a referrer, and the placeholder otherwise', () => {
    const { container, rerender } = render(<BookCover src="https://covers.example/dune.jpg" />);
    const image = container.querySelector('img')!;
    expect(image).toHaveAttribute('src', 'https://covers.example/dune.jpg');
    expect(image).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(image).toHaveAttribute('alt', '');
    for (const src of [undefined, 'http://covers.example/dune.jpg', 'not a url']) {
      rerender(<BookCover src={src} />);
      expect(container.querySelector('img')).toBeNull();
      expect(container.querySelector('svg')).not.toBeNull();
    }
  });

  it('falls back to the placeholder when the image cannot be loaded', () => {
    const { container } = render(<BookCover src="https://covers.example/missing.jpg" />);
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
  });
});

describe('BookForm categories (adding a book)', () => {
  const group = (id: string, name: string) => ({
    id: id.repeat(24),
    name,
    createdAt: NOW,
    updatedAt: NOW,
  });
  const categories = [group('c', 'Philosophy'), group('d', 'Fiction'), group('e', 'Poetry')];
  const created = 'a'.repeat(24);

  /** Answers the create, then each category request in turn. */
  function answer(...categoryStatuses: number[]) {
    fetchMock.mockResolvedValueOnce(json(201, { data: { ...book, id: created } }));
    for (const status of categoryStatuses) {
      fetchMock.mockResolvedValueOnce(
        status === 204
          ? new Response(null, { status: 204 })
          : json(status, { error: { code: 'SERVICE_UNAVAILABLE', message: 'x' } }),
      );
    }
  }

  async function addWith(names: string[]) {
    const user = userEvent.setup();
    render(<BookForm categories={categories} />);
    await user.type(screen.getByLabelText('Title'), 'Meditations');
    for (const name of names) await user.click(screen.getByRole('checkbox', { name }));
    await user.click(screen.getByRole('button', { name: 'Add book' }));
  }

  it('creates the book, then adds it to each chosen category', async () => {
    answer(204, 204);
    await addWith(['Philosophy', 'Poetry']);
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(`/library/books/${created}?notice=book-created`),
    );
    expect(writes().map(([url, init]) => `${init.method} ${url}`)).toEqual([
      'POST /api/library/books',
      `PUT /api/library/categories/${'c'.repeat(24)}/books/${created}`,
      `PUT /api/library/categories/${'e'.repeat(24)}/books/${created}`,
    ]);
    // The book itself is sent without any category field.
    expect(JSON.parse(writes()[0]![1].body)).not.toHaveProperty('categoryIds');
  });

  it('says so on the book page when a category could not be added', async () => {
    answer(204, 503);
    await addWith(['Philosophy', 'Fiction']);
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(
        `/library/books/${created}?notice=book-created-categories-incomplete`,
      ),
    );
  });

  it('sends no category request when none is chosen', async () => {
    answer();
    await addWith([]);
    await waitFor(() => expect(router.push).toHaveBeenCalled());
    expect(writes()).toHaveLength(1);
  });

  it('explains an empty or unavailable list, and is absent when editing', () => {
    const { rerender } = render(<BookForm categories={[]} />);
    expect(screen.getByRole('group', { name: 'Categories (optional)' })).toHaveTextContent(
      'You have no categories yet.',
    );
    rerender(<BookForm categories={null} />);
    expect(screen.getByRole('group', { name: 'Categories (optional)' })).toHaveTextContent(
      'couldn’t be loaded',
    );
    rerender(<BookForm book={book} />);
    expect(screen.queryByRole('group', { name: 'Categories (optional)' })).not.toBeInTheDocument();
  });
});
