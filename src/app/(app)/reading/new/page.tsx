import type { Metadata, Route } from 'next';
import { notFound } from 'next/navigation';
import { authorLine } from '@/components/library/book-summary';
import { DataUnavailable } from '@/components/library/data-unavailable';
import { LibraryBreadcrumb } from '@/components/library/library-breadcrumb';
import { describeProgress, ReadingStateBadge } from '@/components/reading/reading-display';
import { StartReadingForm } from '@/components/reading/start-reading-form';
import { StartReadingPicker } from '@/components/reading/start-reading-picker';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { isObjectId } from '@/lib/library/rules';
import { readingStateOf } from '@/lib/reading/types';
import { requireSignedInProfile } from '@/server/current-session';
import { getBook } from '@/server/library/library-api';
import { loadAsReader } from '@/server/library/reader-data';
import { getReadingOverview } from '@/server/reading/reading-api';

export const metadata: Metadata = { title: 'New reading' };

export default async function NewReadingPage({ searchParams }: PageProps<'/reading/new'>) {
  await requireSignedInProfile();
  const { bookId } = await searchParams;
  const back = <LibraryBreadcrumb href="/reading" label="Reading" />;

  if (!isObjectId(bookId)) {
    return (
      <>
        <PageHeader title="Start a reading" description="Choose the book first." before={back} />
        <Card>
          <StartReadingPicker />
        </Card>
      </>
    );
  }

  const id = bookId.toLowerCase();
  const result = await loadAsReader(async (api) => {
    const [book, overview] = await Promise.all([getBook(api, id), getReadingOverview(api, id)]);
    return { book, overview };
  });
  if (result.status === 'not-found') notFound();
  if (result.status === 'unavailable') {
    return (
      <>
        <PageHeader title="Start a reading" before={back} />
        <DataUnavailable
          what="book"
          retryHref={`/reading/new?bookId=${id}`}
          retryAfterSeconds={result.retryAfterSeconds}
        />
      </>
    );
  }

  const { book, overview } = result.value;
  const state = readingStateOf(overview);
  return (
    <>
      <PageHeader
        title={state === 'finished' ? `Reread “${book.title}”` : `Read “${book.title}”`}
        description={authorLine(book.authors)}
        before={back}
      />
      <div className="mb-6 flex flex-wrap items-center gap-3 text-sm text-ink-muted">
        <ReadingStateBadge state={state} />
        <span>
          {overview.completedSessions === 0
            ? 'No finished readings yet.'
            : `Finished ${overview.completedSessions} ${overview.completedSessions === 1 ? 'time' : 'times'}.`}{' '}
          Earlier readings are kept as they are.
        </span>
      </div>
      {overview.activeSession ? (
        <Card className="mb-6 flex flex-col gap-3">
          <p className="text-sm text-ink">
            You’re already reading this book (
            {describeProgress(overview.activeSession.progress, book)}
            ). A book has one reading in progress at a time, so continue that one, or finish it
            before starting another. You can still record an earlier finished read below.
          </p>
          <ButtonLink href={`/reading/${overview.activeSession.id}` as Route} className="w-fit">
            Continue your current reading
          </ButtonLink>
        </Card>
      ) : null}
      <Card>
        <StartReadingForm
          bookId={book.id}
          lengths={{ pageCount: book.pageCount, chapterCount: book.chapterCount }}
          activeSession={overview.activeSession}
        />
      </Card>
    </>
  );
}
