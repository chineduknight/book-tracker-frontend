'use client';

import type { Route } from 'next';
import { BookOpen } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { BookPicker } from '@/components/library/book-picker';
import { Button } from '@/components/ui/button';

/**
 * Choose a catalogue book to start (or record) a reading of it. On the Reading page the picker
 * opens on request, so a long catalogue never pushes the history out of view.
 */
export function StartReadingPicker({ collapsible = false }: { collapsible?: boolean }) {
  const router = useRouter();
  const regionId = useId();
  const [isOpen, setIsOpen] = useState(!collapsible);
  return (
    <div className="flex flex-col gap-4">
      {collapsible ? (
        <Button
          variant={isOpen ? 'secondary' : 'primary'}
          className="w-fit"
          aria-expanded={isOpen}
          aria-controls={regionId}
          onClick={() => setIsOpen((open) => !open)}
        >
          <BookOpen aria-hidden="true" className="size-4" />
          {isOpen ? 'Close the book list' : 'Choose a book to read'}
        </Button>
      ) : null}
      <div id={regionId} hidden={!isOpen}>
        {isOpen ? (
          <BookPicker
            label="Find a book in your library"
            chooseLabel="Read this"
            onChoose={(book) => router.push(`/reading/new?bookId=${book.id}` as Route)}
          />
        ) : null}
      </div>
    </div>
  );
}
