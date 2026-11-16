import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DataUnavailable } from '@/components/library/data-unavailable';
import { LibraryBreadcrumb } from '@/components/library/library-breadcrumb';
import { NoteForm } from '@/components/notes/note-form';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { ApiError } from '@/lib/api/errors';
import { isObjectId, PAGE_SIZE } from '@/lib/library/rules';
import type { ReadingSession } from '@/lib/reading/types';
import { requireSignedInProfile } from '@/server/current-session';
import { getBook } from '@/server/library/library-api';
import { loadAsReader } from '@/server/library/reader-data';
import { orNullIfMissing } from '@/server/reading/book-lookup';
import { getSession, listBookSessions } from '@/server/reading/reading-api';

export const metadata: Metadata = { title: 'New note' };

const DESCRIPTION =
  'A private note in your own words, or a highlight quoting the book. Nothing is saved until you choose Save.';

export default async function NewNotePage({ searchParams }: PageProps<'/notes/new'>) {
  await requireSignedInProfile();
  const { bookId, readingSessionId } = await searchParams;
  const back = <LibraryBreadcrumb href="/notes" label="Notes" />;
  const header = (
    <PageHeader title="New note or highlight" description={DESCRIPTION} before={back} />
  );

  if (!isObjectId(bookId)) {
    return (
      <>
        {header}
        <Card>
          <NoteForm initialBook={null} initialSessions={null} initialSessionId="" />
        </Card>
      </>
    );
  }

  const id = bookId.toLowerCase();
  const wantedSession = isObjectId(readingSessionId) ? readingSessionId.toLowerCase() : undefined;
  const result = await loadAsReader(async (api) => {
    const book = await getBook(api, id);
    let sessions: ReadingSession[] | null = null;
    let totalPages = 0;
    try {
      const page = await listBookSessions(api, id, { page: 1, limit: PAGE_SIZE });
      sessions = page.items;
      totalPages = page.pagination.totalPages;
      // A reading linked from its own page is offered even if it's older than the first page.
      if (wantedSession && !sessions.some((session) => session.id === wantedSession)) {
        const session = await orNullIfMissing(getSession(api, wantedSession));
        if (session?.bookId === id) sessions = [session, ...sessions];
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) throw error;
      sessions = null; // The form loads them itself; the note can be saved without a link.
    }
    return { book, sessions, totalPages };
  });
  if (result.status === 'not-found') notFound();
  if (result.status === 'unavailable') {
    return (
      <>
        {header}
        <DataUnavailable
          what="book"
          retryHref={`/notes/new?bookId=${id}`}
          retryAfterSeconds={result.retryAfterSeconds}
        />
      </>
    );
  }

  const { book, sessions, totalPages } = result.value;
  const preselected =
    wantedSession && sessions?.some((session) => session.id === wantedSession) ? wantedSession : '';
  return (
    <>
      {header}
      <Card>
        <NoteForm
          initialBook={book}
          initialSessions={sessions ? { items: sessions, page: 1, totalPages } : null}
          initialSessionId={preselected}
        />
      </Card>
    </>
  );
}
