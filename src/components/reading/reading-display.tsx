import { Badge } from '@/components/ui/badge';
import { formatCalendarDate, formatTimestampDay } from '@/lib/dates/calendar-date';
import type { BookLengths } from '@/lib/reading/session-form';
import {
  READING_STATE_LABELS,
  type ReadingProgress,
  type ReadingSession,
  type ReadingState,
} from '@/lib/reading/types';

/** "Page 120 of 320", "Chapter 4", "45%": the book's length only where it is known. */
export function describeProgress(
  progress: ReadingProgress | null,
  lengths: BookLengths = {},
): string {
  if (!progress) return 'No progress recorded';
  switch (progress.unit) {
    case 'pages':
      return lengths.pageCount === undefined
        ? `Page ${progress.value}`
        : `Page ${progress.value} of ${lengths.pageCount}`;
    case 'chapters':
      return lengths.chapterCount === undefined
        ? `Chapter ${progress.value}`
        : `Chapter ${progress.value} of ${lengths.chapterCount}`;
    case 'percent':
      return `${progress.value}%`;
  }
}

/** Only dates the reader entered; none is ever inferred from when the record was saved. */
export function describeDates(session: ReadingSession): string {
  const parts = [
    session.startedOn ? `Started ${formatCalendarDate(session.startedOn)}` : undefined,
    session.completedOn ? `Finished ${formatCalendarDate(session.completedOn)}` : undefined,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'No dates recorded';
}

/**
 * A stable, distinguishable name for a reading in links and selectors: what it is, when it was
 * recorded (UTC day) and a short permanent reference from its id.
 */
export function sessionName(session: ReadingSession): string {
  const kind = session.status === 'in_progress' ? 'Reading in progress' : 'Finished reading';
  const when = session.startedOn
    ? `started ${formatCalendarDate(session.startedOn)}`
    : `recorded ${formatTimestampDay(session.createdAt)}`;
  return `${kind}, ${when} #${session.id.slice(-6)}`;
}

export function ReadingStatusBadge({
  session,
  isReread = false,
}: {
  session: ReadingSession;
  isReread?: boolean;
}) {
  if (session.status === 'completed') return <Badge>Finished</Badge>;
  return (
    <Badge className="border-accent bg-accent-soft text-accent-ink">
      {isReread ? 'Rereading' : 'Reading now'}
    </Badge>
  );
}

export function ReadingStateBadge({ state }: { state: ReadingState }) {
  const active = state === 'reading' || state === 'rereading';
  return (
    <Badge className={active ? 'border-accent bg-accent-soft text-accent-ink' : undefined}>
      {READING_STATE_LABELS[state]}
    </Badge>
  );
}

export function RatingText({ rating }: { rating: number | undefined }) {
  if (rating === undefined) return null;
  return (
    <span className="text-sm text-ink">
      <span aria-hidden="true" className="tracking-wider text-accent">
        {'★'.repeat(rating)}
        <span className="text-line-strong">{'★'.repeat(5 - rating)}</span>
      </span>
      <span className="sr-only">Rated {rating} out of 5</span>
    </span>
  );
}
