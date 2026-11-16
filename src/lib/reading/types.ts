import type { BookReadingStatus, ProgressUnit, ReadingStatus } from './rules';

export interface ReadingProgress {
  unit: ProgressUnit;
  value: number;
}

/** One distinct reading of a catalogue book (never of a physical copy). */
export interface ReadingSession {
  id: string;
  bookId: string;
  status: ReadingStatus;
  /** Always present; null when not recorded. */
  progress: ReadingProgress | null;
  startedOn?: string | undefined;
  completedOn?: string | undefined;
  rating?: number | undefined;
  summary?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface ReadingOverview {
  bookId: string;
  status: BookReadingStatus;
  totalSessions: number;
  completedSessions: number;
  activeSession: ReadingSession | null;
  lastCompletedSession: ReadingSession | null;
}

/**
 * What a book's reading state means to the reader. "Rereading" is an in-progress read after at
 * least one finished read; it is derived from the overview, never stored.
 */
export type ReadingState = 'never-read' | 'reading' | 'rereading' | 'finished';

export function readingStateOf(overview: ReadingOverview): ReadingState {
  if (overview.activeSession) return overview.completedSessions > 0 ? 'rereading' : 'reading';
  return overview.completedSessions > 0 ? 'finished' : 'never-read';
}

export const READING_STATE_LABELS: Record<ReadingState, string> = {
  'never-read': 'Not read yet',
  reading: 'Reading now',
  rereading: 'Rereading',
  finished: 'Read',
};
