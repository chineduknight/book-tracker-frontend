import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Book } from '@/lib/library/types';
import type { Note } from '@/lib/notes/types';
import { NoteCommentary, NoteContent, NoteExcerpt } from './note-display';
import { NoteEditForm } from './note-edit-form';
import { NoteForm } from './note-form';

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/lib/navigation/hard-navigation', () => ({ navigateTo: vi.fn(), replaceWith: vi.fn() }));

const NOW = '2026-11-15T10:00:00.000Z';
const book: Book = {
  id: 'b'.repeat(24),
  title: 'Middlemarch',
  authors: ['George Eliot'],
  format: 'physical',
  createdAt: NOW,
  updatedAt: NOW,
};
const note: Note = {
  id: 'a'.repeat(24),
  bookId: book.id,
  readingSessionId: null,
  kind: 'note',
  content: 'First line\n\n  second',
  title: 'Thoughts',
  createdAt: NOW,
  updatedAt: NOW,
};
const HOSTILE =
  '<img src=x onerror="alert(1)"><script>alert(2)</script>[link](javascript:alert(3)) ![t](https://tracker.example/p.png)';

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
});
afterEach(() => vi.unstubAllGlobals());

const writes = () => fetchMock.mock.calls.filter(([, init]) => init?.method !== 'GET');

describe('safe presentation', () => {
  it.each(['note', 'highlight'] as const)(
    'shows %s text literally: no HTML, links, images or scripts',
    (kind) => {
      const { container } = render(
        <>
          <NoteContent note={{ kind, content: HOSTILE }} />
          <NoteCommentary commentary={HOSTILE} />
          <NoteExcerpt note={{ kind, content: HOSTILE }} />
        </>,
      );
      expect(container.querySelector('img, script, a, iframe')).toBeNull();
      expect(container.textContent).toContain('<img src=x onerror="alert(1)">');
      expect(container.textContent).toContain('[link](javascript:alert(3))');
    },
  );

  it('labels Markdown truthfully and keeps a highlight’s line breaks as a quotation', () => {
    render(<NoteContent note={{ kind: 'note', content: '# Title\n\n**bold**' }} />);
    expect(screen.getByText('Written in Markdown · shown as plain text')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Title' })).toBeNull();
    const { container } = render(
      <NoteContent note={{ kind: 'highlight', content: 'line one\nline two' }} />,
    );
    const quote = container.querySelector('blockquote');
    expect(quote?.textContent).toBe('line one\nline two');
    expect(quote).toHaveClass('whitespace-pre-wrap');
  });
});

describe('NoteForm', () => {
  it('saves text that was in the fields before any event fired (typed before hydration)', async () => {
    fetchMock.mockResolvedValue(json(201, { data: { ...note, id: 'c'.repeat(24) } }));
    const { container } = render(
      <NoteForm
        initialBook={book}
        initialSessions={{ items: [], page: 1, totalPages: 0 }}
        initialSessionId=""
      />,
    );
    // Values set directly on the DOM, as an early typist on a slow phone leaves them.
    (container.querySelector('input[value="highlight"]') as HTMLInputElement).checked = true;
    (container.querySelector('textarea[name="content"]') as HTMLTextAreaElement).value =
      '  “A quotation,”\n\n   kept   exactly. ';
    fireEvent.submit(container.querySelector('form')!);

    await waitFor(() => expect(writes()).toHaveLength(1));
    const [url, init] = writes()[0]!;
    expect(url).toBe(`/api/notes/books/${book.id}`);
    expect(JSON.parse(init.body)).toEqual({
      kind: 'highlight',
      content: '“A quotation,”\n\n   kept   exactly.',
      readingSessionId: null,
    });
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(`/notes/${'c'.repeat(24)}?notice=note-created`),
    );
  });

  it('requires a kind and a book, and sends nothing until both are chosen', async () => {
    const user = userEvent.setup();
    render(<NoteForm initialBook={null} initialSessions={null} initialSessionId="" />);
    fetchMock.mockResolvedValue(
      json(200, {
        data: { items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } },
      }),
    );
    await user.type(screen.getByLabelText('Your note'), 'Some thoughts');
    await user.click(screen.getByRole('button', { name: 'Save note' }));
    expect(await screen.findByText('Choose note or highlight.')).toBeInTheDocument();
    expect(screen.getByText('Choose the book this note is about.')).toBeInTheDocument();
    expect(writes()).toHaveLength(0);
  });

  it('refuses a note too large for the API before sending it, keeping the text', async () => {
    const { container } = render(
      <NoteForm
        initialBook={book}
        initialSessions={{ items: [], page: 1, totalPages: 0 }}
        initialSessionId=""
      />,
    );
    (container.querySelector('input[value="note"]') as HTMLInputElement).checked = true;
    const textarea = container.querySelector('textarea[name="content"]') as HTMLTextAreaElement;
    textarea.value = 'a' + '\u0001'.repeat(19_998) + 'b';
    fireEvent.submit(container.querySelector('form')!);
    expect(
      await screen.findByText('This note is too large to save in one go.'),
    ).toBeInTheDocument();
    expect(writes()).toHaveLength(0);
    expect(textarea.value).toHaveLength(20_000);
  });

  it('puts a reading/book mismatch on the reading field and keeps the text', async () => {
    fetchMock.mockResolvedValue(
      json(409, {
        error: {
          code: 'READING_SESSION_BOOK_MISMATCH',
          message: 'That reading belongs to a different book.',
        },
      }),
    );
    const session = {
      id: 'd'.repeat(24),
      bookId: book.id,
      status: 'in_progress' as const,
      progress: null,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const { container } = render(
      <NoteForm
        initialBook={book}
        initialSessions={{ items: [session], page: 1, totalPages: 1 }}
        initialSessionId={session.id}
      />,
    );
    (container.querySelector('input[value="note"]') as HTMLInputElement).checked = true;
    (container.querySelector('textarea[name="content"]') as HTMLTextAreaElement).value = 'Kept';
    fireEvent.submit(container.querySelector('form')!);
    expect(
      await screen.findByText('That reading belongs to a different book. Choose another.'),
    ).toBeInTheDocument();
    expect(JSON.parse(writes()[0]![1].body).readingSessionId).toBe(session.id);
    expect((container.querySelector('textarea[name="content"]') as HTMLTextAreaElement).value).toBe(
      'Kept',
    );
  });

  it('reports an unconfirmed save honestly and never retries it by itself', async () => {
    fetchMock.mockRejectedValue(new TypeError('network down'));
    const { container } = render(
      <NoteForm
        initialBook={book}
        initialSessions={{ items: [], page: 1, totalPages: 0 }}
        initialSessionId=""
      />,
    );
    (container.querySelector('input[value="note"]') as HTMLInputElement).checked = true;
    (container.querySelector('textarea[name="content"]') as HTMLTextAreaElement).value = 'Kept';
    fireEvent.submit(container.querySelector('form')!);
    expect(
      await screen.findByText('Avuneri couldn’t confirm whether your note was saved.'),
    ).toBeInTheDocument();
    expect(writes()).toHaveLength(1);
  });
});

describe('NoteEditForm', () => {
  it('sends nothing when nothing changed', async () => {
    const user = userEvent.setup();
    render(<NoteEditForm note={note} />);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('No changes to save.')).toBeInTheDocument();
    expect(writes()).toHaveLength(0);
  });

  it('sends only the changed fields, never kind or the reading link', async () => {
    fetchMock.mockResolvedValue(json(200, { data: note }));
    const user = userEvent.setup();
    render(<NoteEditForm note={note} />);
    await user.clear(screen.getByLabelText('Title (optional)'));
    await user.type(screen.getByLabelText('Chapter (optional)'), 'Book One');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    const [url, init] = writes()[0]!;
    expect(url).toBe(`/api/notes/${note.id}`);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ title: null, chapter: 'Book One' });
  });

  it('asks before a link discards unsaved text, and stays on Keep editing', async () => {
    const user = userEvent.setup();
    render(
      <>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- what Link renders */}
        <a href="/notes">Notes</a>
        <NoteEditForm note={note} />
      </>,
    );
    await user.type(screen.getByLabelText('Your note'), ' more');
    await user.click(screen.getByRole('link', { name: 'Notes' }));
    expect(await screen.findByText('Discard unsaved changes?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Your note')).toHaveValue(`${note.content} more`);

    await user.click(screen.getByRole('link', { name: 'Notes' }));
    await user.click(await screen.findByRole('button', { name: 'Discard changes' }));
    expect(router.push).toHaveBeenCalledWith('/notes');
  });
});
