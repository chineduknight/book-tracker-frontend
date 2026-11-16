import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { authorLine } from '@/components/library/book-summary';
import { DataUnavailable } from '@/components/library/data-unavailable';
import { DeleteButton } from '@/components/library/delete-button';
import { LibraryBreadcrumb } from '@/components/library/library-breadcrumb';
import { Notice } from '@/components/library/notice';
import {
  NoteCommentary,
  NoteContent,
  NoteKindBadge,
  noteLocation,
} from '@/components/notes/note-display';
import { noteHeading } from '@/components/notes/note-list';
import { sessionName } from '@/components/reading/reading-display';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { formatTimestampDay } from '@/lib/dates/calendar-date';
import { isObjectId } from '@/lib/library/rules';
import { requireSignedInProfile } from '@/server/current-session';
import { getBook } from '@/server/library/library-api';
import { loadAsReader } from '@/server/library/reader-data';
import { getNote } from '@/server/notes/note-api';
import { orNullIfMissing } from '@/server/reading/book-lookup';
import { getSession } from '@/server/reading/reading-api';

export const metadata: Metadata = { title: 'Note' };

export default async function NotePage({ params, searchParams }: PageProps<'/notes/[noteId]'>) {
  await requireSignedInProfile();
  const { noteId } = await params;
  const { notice } = await searchParams;
  if (!isObjectId(noteId)) notFound();
  const back = <LibraryBreadcrumb href="/notes" label="Notes" />;

  const result = await loadAsReader(async (api) => {
    const note = await getNote(api, noteId.toLowerCase());
    const [book, session] = await Promise.all([
      getBook(api, note.bookId),
      note.readingSessionId ? orNullIfMissing(getSession(api, note.readingSessionId)) : null,
    ]);
    return { note, book, session };
  });
  if (result.status === 'not-found') notFound();
  if (result.status === 'unavailable') {
    return (
      <>
        <PageHeader title="Note" before={back} />
        <DataUnavailable
          what="note"
          retryHref={`/notes/${noteId}`}
          retryAfterSeconds={result.retryAfterSeconds}
        />
      </>
    );
  }

  const { note, book, session } = result.value;
  const location = noteLocation(note);
  const noun = note.kind === 'highlight' ? 'highlight' : 'note';
  return (
    <>
      <PageHeader title={noteHeading(note)} before={back} />
      <Notice notice={notice} />
      <div className="mb-6 flex flex-wrap gap-3">
        <ButtonLink href={`/notes/${note.id}/edit` as Route} variant="secondary">
          <Pencil aria-hidden="true" className="size-4" />
          Edit {noun}
        </ButtonLink>
        <DeleteButton
          path={`/api/notes/${note.id}`}
          label={`Delete ${noun}`}
          title={`Delete this ${noun}?`}
          redirectTo="/notes?notice=note-deleted"
        >
          It will disappear from your notes, searches and this book. There is no way to restore it
          from here.
        </DeleteButton>
      </div>

      <Card className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
          <NoteKindBadge note={note} />
          <span>
            About{' '}
            <Link
              href={`/library/books/${book.id}` as Route}
              className="font-medium text-accent hover:text-accent-hover"
            >
              {book.title}
            </Link>{' '}
            · {authorLine(book.authors)}
          </span>
        </div>
        {location ? <p className="text-sm text-ink">{location}</p> : null}
        <NoteContent note={note} />
        <NoteCommentary commentary={note.commentary} />
        <dl className="flex flex-col gap-1 text-xs text-ink-muted">
          <div className="flex gap-1">
            <dt>Reading:</dt>
            <dd>
              {note.readingSessionId === null ? (
                'None (a note about the book)'
              ) : session ? (
                <Link
                  href={`/reading/${session.id}` as Route}
                  className="font-medium text-accent hover:text-accent-hover"
                >
                  {sessionName(session)}
                </Link>
              ) : (
                'A reading that is no longer available'
              )}
            </dd>
          </div>
          <div className="flex gap-1">
            <dt>Added:</dt>
            <dd>{formatTimestampDay(note.createdAt)}</dd>
          </div>
          {note.updatedAt !== note.createdAt ? (
            <div className="flex gap-1">
              <dt>Last edited:</dt>
              <dd>{formatTimestampDay(note.updatedAt)}</dd>
            </div>
          ) : null}
        </dl>
      </Card>
    </>
  );
}
