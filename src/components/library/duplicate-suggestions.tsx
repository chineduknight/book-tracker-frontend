'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { Info } from 'lucide-react';
import { useEffect, useState } from 'react';
import { sendToBff } from '@/lib/bff/bff-client';
import { collapseWhitespace } from '@/lib/library/rules';
import type { DuplicateSuggestion } from '@/lib/library/types';
import { authorLine } from './book-summary';

const DEBOUNCE_MS = 600;

/**
 * Informational only: the API allows duplicate titles and ISBNs (another edition, a second copy),
 * so this never blocks saving. Requests are debounced and the previous one is cancelled.
 */
export function DuplicateSuggestions({
  title,
  isbn,
  excludeBookId,
}: {
  title: string;
  isbn: string;
  excludeBookId?: string;
}) {
  const [found, setFound] = useState<{ search: string; matches: DuplicateSuggestion[] }>({
    search: '',
    matches: [],
  });
  const query = new URLSearchParams();
  const cleanTitle = collapseWhitespace(title);
  const cleanIsbn = isbn.trim();
  if (cleanTitle.length >= 2) query.set('title', cleanTitle);
  if (cleanIsbn.length >= 4) query.set('isbn', cleanIsbn);
  const search = query.toString();

  useEffect(() => {
    if (search === '') return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const result = await sendToBff<DuplicateSuggestion[]>(
          'GET',
          `/api/library/books/duplicates?${search}`,
          undefined,
          controller.signal,
        );
        if (result.ok) setFound({ search, matches: result.data ?? [] });
      } catch {
        // Cancelled by a newer keystroke.
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search]);

  // Results are shown only for the query they answer, so stale matches never linger.
  const matches = found.search === search && search !== '' ? found.matches : [];
  const visible = matches.filter((match) => match.book.id !== excludeBookId);
  return (
    <div aria-live="polite">
      {visible.length > 0 ? (
        <div className="flex gap-3 rounded-xl border border-line bg-surface-muted p-4 text-sm">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" />
          <div className="flex min-w-0 flex-col gap-2">
            <p className="font-medium text-ink">
              You may already have this book. You can still save it, for example as another edition.
            </p>
            <ul className="flex flex-col gap-1">
              {visible.map(({ book, matchedOn }) => (
                <li key={book.id} className="break-words">
                  <Link
                    href={`/library/books/${book.id}` as Route}
                    className="font-medium text-accent underline underline-offset-4"
                  >
                    {book.title}
                  </Link>{' '}
                  <span className="text-ink-muted">
                    by {authorLine(book.authors)} · same {matchedOn.join(' and ')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
