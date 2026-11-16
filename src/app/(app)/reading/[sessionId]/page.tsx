import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { authorLine } from '@/components/library/book-summary';
import { DataUnavailable } from '@/components/library/data-unavailable';
import { LibraryBreadcrumb } from '@/components/library/library-breadcrumb';
import { Notice } from '@/components/library/notice';
import { NoteExcerpt, NoteKindBadge } from '@/components/notes/note-display';
import {
  describeDates,
  describeProgress,
  RatingText,
  ReadingStatusBadge,
} from '@/components/reading/reading-display';
import { SessionEditor } from '@/components/reading/session-editor';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { InlineError } from '@/components/ui/inline-error';
import { PageHeader } from '@/components/ui/page-header';
import { SectionHeader } from '@/components/ui/section-header';
import { formatTimestampDay } from '@/lib/dates/calendar-date';
import { isObjectId } from '@/lib/library/rules';
import { notesHref } from '@/lib/notes/queries';
import { requireSignedInProfile } from '@/server/current-session';
import { getBook } from '@/server/library/library-api';
import { loadAsReader } from '@/server/library/reader-data';
import { listNotes } from '@/server/notes/note-api';
import { getReadingOverview, getSession } from '@/server/reading/reading-api';

export const metadata: Metadata = { title: 'Reading' };

export default async function ReadingSessionPage({
  params,
  searchParams,
}: PageProps<'/reading/[sessionId]'>) {
  await requireSignedInProfile();
  const { sessionId } = await params;
  const { notice } = await searchParams;
  if (!isObjectId(sessionId)) notFound();
  const back = <LibraryBreadcrumb href="/reading" label="Reading" />;

  const result = await loadAsReader(async (api) => {
    const session = await getSession(api, sessionId.toLowerCase());
    const [book, overview] = await Promise.all([
      getBook(api, session.bookId),
      getReadingOverview(api, session.bookId),
    ]);
    return { session, book, overview };
  });
  if (result.status === 'not-found') notFound();
  if (result.status === 'unavailable') {
    return (
      <>
        <PageHeader title="Reading" before={back} />
        <DataUnavailable
          what="reading"
          retryHref={`/reading/${sessionId}`}
          retryAfterSeconds={result.retryAfterSeconds}
        />
      </>
    );
  }

  const { session, book, overview } = result.value;
  // Notes are a separate section: if they can't be loaded, the reading itself still shows.
  const notes = await loadAsReader((api) =>
    listNotes(api, { page: 1, limit: 5, bookId: book.id, readingSessionId: session.id }),
  );
  const lengths = { pageCount: book.pageCount, chapterCount: book.chapterCount };
  const isReread = session.status === 'in_progress' && overview.completedSessions > 0;
  const otherActive =
    overview.activeSession && overview.activeSession.id !== session.id
      ? overview.activeSession
      : null;
  const notesOfSession = notesHref({ bookId: book.id, readingSessionId: session.id });

  return (
    <>
      <PageHeader title={book.title} description={authorLine(book.authors)} before={back} />
      <Notice notice={notice} />

      <Card className="mb-8 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <ReadingStatusBadge session={session} isReread={isReread} />
          <span className="text-xs text-ink-muted">
            Recorded {formatTimestampDay(session.createdAt)} · #{session.id.slice(-6)}
          </span>
        </div>
        <p className="text-lg font-medium text-ink">
          {describeProgress(session.progress, lengths)}
        </p>
        <p className="text-sm text-ink-muted">{describeDates(session)}</p>
        <RatingText rating={session.rating} />
        {session.summary ? (
          <p className="max-w-prose text-sm whitespace-pre-wrap break-words text-ink">
            {session.summary}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3 pt-2">
          <ButtonLink href={`/library/books/${book.id}` as Route} variant="secondary">
            Book details
          </ButtonLink>
          {session.status === 'completed' ? (
            otherActive ? (
              <ButtonLink href={`/reading/${otherActive.id}` as Route} variant="secondary">
                Continue the current reading
              </ButtonLink>
            ) : (
              <ButtonLink href={`/reading/new?bookId=${book.id}` as Route} variant="secondary">
                Start a reread
              </ButtonLink>
            )
          ) : null}
        </div>
      </Card>

      <section aria-labelledby="edit-heading" className="mb-10">
        <SectionHeader
          id="edit-heading"
          title={session.status === 'in_progress' ? 'Update this reading' : 'Correct this reading'}
          description={
            session.status === 'in_progress'
              ? 'Save your progress as you go. When you’re done, mark the reading as finished.'
              : 'This reading is finished. You can still correct its progress, dates, rating and summary. To read the book again, start a reread.'
          }
        />
        <Card>
          <SessionEditor key={session.updatedAt} session={session} lengths={lengths} />
        </Card>
      </section>

      <section aria-labelledby="notes-heading">
        <SectionHeader
          id="notes-heading"
          title="Notes from this reading"
          description="Notes and highlights linked to this reading. A note’s link to a reading is set when it’s created and can’t be changed."
        />
        <div className="mb-4">
          <ButtonLink
            href={`/notes/new?bookId=${book.id}&readingSessionId=${session.id}` as Route}
            variant="secondary"
          >
            Add a note to this reading
          </ButtonLink>
        </div>
        {notes.status === 'ok' ? (
          notes.value.pagination.total === 0 ? (
            <p className="text-sm text-ink-muted">No notes are linked to this reading yet.</p>
          ) : (
            <>
              <ul className="flex flex-col gap-3">
                {notes.value.items.map((note) => (
                  <li
                    key={note.id}
                    className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <NoteKindBadge note={note} />
                      <Link
                        href={`/notes/${note.id}` as Route}
                        className="font-medium break-words text-ink hover:text-accent"
                      >
                        {note.title ??
                          `${note.kind === 'highlight' ? 'Highlight' : 'Note'} from ${formatTimestampDay(note.createdAt)}`}
                      </Link>
                    </div>
                    <NoteExcerpt note={note} />
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm">
                <Link
                  href={notesOfSession as Route}
                  className="font-medium text-accent hover:text-accent-hover"
                >
                  {notes.value.pagination.total === 1
                    ? 'Open in Notes'
                    : `All ${notes.value.pagination.total} notes from this reading`}
                </Link>
              </p>
            </>
          )
        ) : (
          <InlineError title="Notes from this reading couldn’t be loaded.">
            <p>The reading itself is shown above. Reload the page to try again.</p>
          </InlineError>
        )}
      </section>
    </>
  );
}
