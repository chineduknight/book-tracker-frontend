import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DataUnavailable } from '@/components/library/data-unavailable';
import { LibraryBreadcrumb } from '@/components/library/library-breadcrumb';
import { NoteEditForm } from '@/components/notes/note-edit-form';
import { NoteKindBadge } from '@/components/notes/note-display';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { isObjectId } from '@/lib/library/rules';
import { requireSignedInProfile } from '@/server/current-session';
import { getBook } from '@/server/library/library-api';
import { loadAsReader } from '@/server/library/reader-data';
import { getNote } from '@/server/notes/note-api';

export const metadata: Metadata = { title: 'Edit note' };

export default async function EditNotePage({ params }: PageProps<'/notes/[noteId]/edit'>) {
  await requireSignedInProfile();
  const { noteId } = await params;
  if (!isObjectId(noteId)) notFound();
  const id = noteId.toLowerCase();
  const back = <LibraryBreadcrumb href={`/notes/${id}`} label="Back to the note" />;

  const result = await loadAsReader(async (api) => {
    const note = await getNote(api, id);
    return { note, book: await getBook(api, note.bookId) };
  });
  if (result.status === 'not-found') notFound();
  if (result.status === 'unavailable') {
    return (
      <>
        <PageHeader title="Edit note" before={back} />
        <DataUnavailable
          what="note"
          retryHref={`/notes/${id}/edit`}
          retryAfterSeconds={result.retryAfterSeconds}
        />
      </>
    );
  }

  const { note, book } = result.value;
  const noun = note.kind === 'highlight' ? 'highlight' : 'note';
  return (
    <>
      <PageHeader title={`Edit ${noun}`} description={`About “${book.title}”`} before={back} />
      <div className="mb-6 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
        <NoteKindBadge note={note} />
        <span>
          Its kind{note.readingSessionId ? ' and its link to a reading are' : ' is'} fixed and can’t
          be changed.
        </span>
      </div>
      <Card>
        <NoteEditForm note={note} />
      </Card>
    </>
  );
}
