'use client';

import { useEffect, useState } from 'react';
import { sessionName } from '@/components/reading/reading-display';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import type { Page } from '@/lib/api/contract';
import { sendToBff } from '@/lib/bff/bff-client';
import type { ReadingSession } from '@/lib/reading/types';

export interface SessionChoices {
  items: ReadingSession[];
  page: number;
  totalPages: number;
}

/**
 * Optionally links a new note to one reading of the chosen book. Readings are paged with "Load
 * more", so every one is reachable. The choice is permanent once the note is saved.
 */
export function SessionSelect({
  bookId,
  initial,
  defaultValue,
  error,
}: {
  bookId: string;
  initial: SessionChoices | null;
  defaultValue: string;
  error?: string | undefined;
}) {
  const [choices, setChoices] = useState<SessionChoices | null>(initial);
  const [state, setState] = useState<'idle' | 'loading' | 'failed'>(initial ? 'idle' : 'loading');

  function fetchPage(page: number, signal?: AbortSignal) {
    return sendToBff<Page<ReadingSession>>(
      'GET',
      `/api/reading/books/${bookId}/sessions${page > 1 ? `?page=${page}` : ''}`,
      undefined,
      signal,
    );
  }

  function apply(page: number, result: Awaited<ReturnType<typeof fetchPage>>) {
    if (!result.ok || !result.data) {
      setState('failed');
      return;
    }
    const { items, pagination } = result.data;
    setChoices((current) => ({
      items: page === 1 || !current ? items : [...current.items, ...items],
      page: pagination.page,
      totalPages: pagination.totalPages,
    }));
    setState('idle');
  }

  async function load(page: number) {
    setState('loading');
    apply(page, await fetchPage(page));
  }

  // Without server-loaded choices (a book picked on this page), load the first page once.
  useEffect(() => {
    if (initial) return;
    const controller = new AbortController();
    fetchPage(1, controller.signal)
      .then((result) => apply(1, result))
      .catch(() => undefined);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one load per mounted book
  }, [bookId, initial]);

  return (
    <div className="flex flex-col gap-2">
      <Select
        label="Link to a reading (optional)"
        name="readingSessionId"
        hint="Linking is permanent: after saving, the note can’t be moved to another reading or book."
        defaultValue={defaultValue}
        error={error}
      >
        <option value="">None: a note about the book</option>
        {choices?.items.map((session) => (
          <option key={session.id} value={session.id}>
            {sessionName(session)}
          </option>
        ))}
      </Select>
      <p className="text-xs text-ink-muted" aria-live="polite">
        {state === 'loading'
          ? 'Loading this book’s readings…'
          : state === 'failed'
            ? 'This book’s readings couldn’t be loaded. You can still save the note without a link.'
            : choices && choices.items.length === 0
              ? 'This book has no readings yet.'
              : ''}
      </p>
      {choices && choices.page < choices.totalPages ? (
        <Button
          variant="secondary"
          className="w-fit"
          aria-disabled={state === 'loading'}
          onClick={() => {
            if (state !== 'loading') void load(choices.page + 1);
          }}
        >
          Load more readings
        </Button>
      ) : null}
      {state === 'failed' ? (
        <Button
          variant="secondary"
          className="w-fit"
          onClick={() => void load((choices?.page ?? 0) + 1)}
        >
          Try again
        </Button>
      ) : null}
    </div>
  );
}
