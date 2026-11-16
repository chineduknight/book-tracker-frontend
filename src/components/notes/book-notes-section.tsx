import type { Route } from 'next';
import Link from 'next/link';
import { ButtonLink } from '@/components/ui/button';
import { InlineError } from '@/components/ui/inline-error';
import { SectionHeader } from '@/components/ui/section-header';
import type { Page } from '@/lib/api/contract';
import type { Note } from '@/lib/notes/types';
import type { ReaderData } from '@/server/library/reader-data';
import { NoteExcerpt, NoteKindBadge } from './note-display';
import { noteHeading } from './note-list';

/** A compact look at the book's notes: the newest three and the API's total, with links. */
export function BookNotesSection({
  bookId,
  data,
}: {
  bookId: string;
  data: ReaderData<Page<Note>>;
}) {
  return (
    <section aria-labelledby="book-notes-heading" className="mb-10">
      <SectionHeader
        id="book-notes-heading"
        title="Notes and highlights"
        description="Your private notes and quotations from this book."
      />
      <div className="mb-4 flex flex-wrap gap-3">
        <ButtonLink href={`/notes/new?bookId=${bookId}` as Route} variant="secondary">
          New note or highlight
        </ButtonLink>
      </div>
      {data.status !== 'ok' ? (
        <InlineError title="Notes for this book couldn’t be loaded.">
          <p>The rest of this book is shown as usual. Reload the page to try again.</p>
        </InlineError>
      ) : data.value.pagination.total === 0 ? (
        <p className="text-sm text-ink-muted">No notes or highlights for this book yet.</p>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {data.value.items.map((note) => (
              <li
                key={note.id}
                className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <NoteKindBadge note={note} />
                  <Link
                    href={`/notes/${note.id}` as Route}
                    className="text-sm font-medium break-words text-ink hover:text-accent"
                  >
                    {noteHeading(note)}
                  </Link>
                </div>
                <NoteExcerpt note={note} />
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm">
            <Link
              href={`/notes?bookId=${bookId}` as Route}
              className="font-medium text-accent hover:text-accent-hover"
            >
              {data.value.pagination.total === 1
                ? 'Open in Notes'
                : `All ${data.value.pagination.total} notes and highlights`}
            </Link>
          </p>
        </>
      )}
    </section>
  );
}
