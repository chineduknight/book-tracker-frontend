'use client';

import { Search } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { Page } from '@/lib/api/contract';
import { sendToBff } from '@/lib/bff/bff-client';
import { parseSearchText } from '@/lib/library/queries';
import type { Book } from '@/lib/library/types';
import { authorLine } from './book-summary';

type SearchState =
  { status: 'loading' } | { status: 'ready'; books: Book[]; total: number } | { status: 'failed' };

/**
 * Finds a book in the reader's catalogue through the BFF (whole-word search, as the API does) and
 * hands it to `onChoose`. Shows recent books until something is typed.
 */
export function BookPicker({
  label,
  chooseLabel,
  onChoose,
  excludeIds = [],
  isPending = false,
}: {
  label: string;
  chooseLabel: string;
  onChoose: (book: Book) => void;
  excludeIds?: readonly string[];
  isPending?: boolean;
}) {
  const inputId = useId();
  const [text, setText] = useState('');
  const [state, setState] = useState<SearchState>({ status: 'loading' });
  const query = parseSearchText(text);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setState({ status: 'loading' });
      const search = new URLSearchParams(query ? { q: query } : {}).toString();
      try {
        const result = await sendToBff<Page<Book>>(
          'GET',
          `/api/library/books${search ? `?${search}` : ''}`,
          undefined,
          controller.signal,
        );
        setState(
          result.ok && result.data
            ? { status: 'ready', books: result.data.items, total: result.data.pagination.total }
            : { status: 'failed' },
        );
      } catch {
        // Superseded by a newer search.
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const books =
    state.status === 'ready' ? state.books.filter((book) => !excludeIds.includes(book.id)) : [];

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor={inputId} className="text-sm font-medium text-ink">
        {label}
      </label>
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-3 left-3 size-5 text-ink-muted"
        />
        <input
          id={inputId}
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Title or author words"
          className="min-h-11 w-full rounded-lg border border-line-strong bg-surface py-2 pr-3 pl-10 text-base text-ink"
        />
      </div>
      <div aria-live="polite" aria-busy={state.status === 'loading'}>
        {state.status === 'loading' ? <p className="text-sm text-ink-muted">Searching…</p> : null}
        {state.status === 'failed' ? (
          <p className="text-sm text-danger">
            Your library couldn’t be searched right now. Try again.
          </p>
        ) : null}
        {state.status === 'ready' && books.length === 0 ? (
          <p className="text-sm text-ink-muted">
            {query ? 'No books match those words.' : 'No other books in your library yet.'}
          </p>
        ) : null}
        {books.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {books.map((book) => (
              <li
                key={book.id}
                className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="min-w-0 text-sm break-words">
                  <span className="font-medium text-ink">{book.title}</span>
                  <span className="text-ink-muted"> · {authorLine(book.authors)}</span>
                </span>
                <Button
                  variant="secondary"
                  className="min-h-10 shrink-0"
                  aria-disabled={isPending}
                  onClick={() => {
                    if (!isPending) onChoose(book);
                  }}
                >
                  {chooseLabel}
                  <span className="sr-only"> {book.title}</span>
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
