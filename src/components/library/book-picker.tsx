'use client';

import { Search } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { Page } from '@/lib/api/contract';
import { sendToBff } from '@/lib/bff/bff-client';
import { parseSearchText } from '@/lib/library/queries';
import { FORMAT_LABELS } from '@/lib/library/rules';
import type { Book } from '@/lib/library/types';
import { authorLine } from './book-summary';

type Results =
  | { status: 'loading' }
  | { status: 'failed' }
  | {
      status: 'ready';
      books: Book[];
      page: number;
      totalPages: number;
      total: number;
      more: 'idle' | 'loading' | 'failed';
    };

/** Format, edition, year and ISBN: enough to tell editions of the same title apart. */
export function bookDetails(book: Book): string {
  return [
    FORMAT_LABELS[book.format],
    book.edition,
    book.publicationYear?.toString(),
    book.isbn ? `ISBN ${book.isbn}` : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
}

async function fetchPage(query: string | undefined, page: number, signal: AbortSignal) {
  const search = new URLSearchParams({
    ...(query ? { q: query } : {}),
    ...(page > 1 ? { page: String(page) } : {}),
  });
  const path = `/api/library/books${search.size > 0 ? `?${search}` : ''}`;
  return sendToBff<Page<Book>>('GET', path, undefined, signal);
}

/**
 * Finds a book in the reader's catalogue through the BFF (whole-word search, as the API does) and
 * hands it to `onChoose`. Results follow the API's pagination with "Load more", so every matching
 * book is reachable; a new search cancels and replaces the previous one.
 */
export function BookPicker({
  label,
  chooseLabel,
  onChoose,
  excludeIds = [],
  excludedReason = 'already chosen',
  isPending = false,
}: {
  label: string;
  chooseLabel: string;
  onChoose: (book: Book) => void;
  excludeIds?: readonly string[];
  /** Why excluded books are not offered, e.g. "already in this collection". */
  excludedReason?: string;
  isPending?: boolean;
}) {
  const inputId = useId();
  const [text, setText] = useState('');
  const [results, setResults] = useState<Results>({ status: 'loading' });
  const moreController = useRef<AbortController | null>(null);
  const query = parseSearchText(text);

  useEffect(() => {
    const controller = new AbortController();
    moreController.current?.abort();
    const timer = setTimeout(async () => {
      setResults({ status: 'loading' });
      try {
        const result = await fetchPage(query, 1, controller.signal);
        setResults(
          result.ok && result.data
            ? { status: 'ready', books: result.data.items, ...result.data.pagination, more: 'idle' }
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

  async function loadMore() {
    if (results.status !== 'ready' || results.more === 'loading') return;
    const controller = new AbortController();
    moreController.current = controller;
    setResults({ ...results, more: 'loading' });
    try {
      const result = await fetchPage(query, results.page + 1, controller.signal);
      setResults((current) =>
        current.status !== 'ready'
          ? current
          : result.ok && result.data
            ? {
                ...current,
                books: [...current.books, ...result.data.items],
                ...result.data.pagination,
                more: 'idle',
              }
            : { ...current, more: 'failed' },
      );
    } catch {
      // Cancelled by a new search.
    }
  }

  const ready = results.status === 'ready' ? results : null;
  const offered = ready ? ready.books.filter((book) => !excludeIds.includes(book.id)) : [];
  const hasMore = ready !== null && ready.page < ready.totalPages;

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
      <div
        aria-live="polite"
        aria-busy={results.status === 'loading'}
        className="flex flex-col gap-3"
      >
        {results.status === 'loading' ? <p className="text-sm text-ink-muted">Searching…</p> : null}
        {results.status === 'failed' ? (
          <p className="text-sm text-danger">
            Your library couldn’t be searched right now. Try again.
          </p>
        ) : null}
        {ready ? (
          <p className="text-sm text-ink-muted">
            {ready.total === 0
              ? query
                ? 'No books match those words.'
                : 'Your library has no books yet.'
              : `Showing ${ready.books.length} of ${ready.total} ${query ? 'matching ' : ''}${ready.total === 1 ? 'book' : 'books'}.`}
            {ready.total > 0 && offered.length < ready.books.length
              ? ` ${ready.books.length - offered.length} shown so far ${ready.books.length - offered.length === 1 ? 'is' : 'are'} ${excludedReason}.`
              : ''}
            {ready.total > 0 && offered.length === 0 && !hasMore
              ? ' There are no other books to choose.'
              : ''}
          </p>
        ) : null}
        {offered.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {offered.map((book) => (
              <li
                key={book.id}
                className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="flex min-w-0 flex-col text-sm break-words">
                  <span className="font-medium text-ink">{book.title}</span>
                  <span className="text-ink-muted">{authorLine(book.authors)}</span>
                  <span className="text-xs text-ink-muted">{bookDetails(book)}</span>
                </span>
                <Button
                  variant="secondary"
                  className="min-h-10 shrink-0"
                  aria-label={`${chooseLabel} ${book.title}, ${bookDetails(book)}`}
                  aria-disabled={isPending}
                  onClick={() => {
                    if (!isPending) onChoose(book);
                  }}
                >
                  {chooseLabel}
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        {hasMore ? (
          <div className="flex flex-col gap-2">
            <Button
              variant="secondary"
              aria-disabled={ready?.more === 'loading'}
              onClick={() => void loadMore()}
            >
              {ready?.more === 'loading' ? 'Loading…' : 'Load more books'}
            </Button>
            {ready?.more === 'failed' ? (
              <p className="text-sm text-danger">More books couldn’t be loaded. Try again.</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
