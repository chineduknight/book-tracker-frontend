import type { Route } from 'next';
import Link from 'next/link';
import { authorLine } from '@/components/library/book-summary';
import { formatTimestampDay } from '@/lib/dates/calendar-date';
import type { Book } from '@/lib/library/types';
import type { Note } from '@/lib/notes/types';
import { NoteExcerpt, NoteKindBadge, noteLocation } from './note-display';

export function noteHeading(note: Note): string {
  return (
    note.title ??
    `${note.kind === 'highlight' ? 'Highlight' : 'Note'} from ${formatTimestampDay(note.createdAt)}`
  );
}

/** One page of notes: which book, what kind, where in the book, and a literal excerpt. */
export function NoteList({ rows }: { rows: Array<{ note: Note; book: Book | null }> }) {
  return (
    <ul className="flex flex-col gap-3">
      {rows.map(({ note, book }) => {
        const location = noteLocation(note);
        return (
          <li
            key={note.id}
            className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <NoteKindBadge note={note} />
              <Link
                href={`/notes/${note.id}` as Route}
                className="font-serif text-lg font-semibold break-words text-ink hover:text-accent"
              >
                {noteHeading(note)}
              </Link>
            </div>
            <p className="text-sm break-words text-ink-muted">
              {book ? (
                <>
                  <Link
                    href={`/library/books/${book.id}` as Route}
                    className="font-medium text-accent hover:text-accent-hover"
                  >
                    {book.title}
                  </Link>{' '}
                  · {authorLine(book.authors)}
                </>
              ) : (
                'This book is no longer in your library.'
              )}
            </p>
            {location || note.readingSessionId ? (
              <p className="text-xs text-ink-muted">
                {location}
                {location && note.readingSessionId ? ' · ' : ''}
                {note.readingSessionId ? (
                  <Link
                    href={`/reading/${note.readingSessionId}` as Route}
                    className="font-medium text-accent hover:text-accent-hover"
                  >
                    From a reading
                  </Link>
                ) : null}
              </p>
            ) : null}
            <NoteExcerpt note={note} />
          </li>
        );
      })}
    </ul>
  );
}
