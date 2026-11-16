/** Reading-session values and limits, mirroring book-tracker-backend's reading module exactly. */
export const READING_STATUSES = ['in_progress', 'completed'] as const;
export type ReadingStatus = (typeof READING_STATUSES)[number];

export const READING_STATUS_LABELS: Record<ReadingStatus, string> = {
  in_progress: 'Reading',
  completed: 'Finished',
};

export const PROGRESS_UNITS = ['pages', 'chapters', 'percent'] as const;
export type ProgressUnit = (typeof PROGRESS_UNITS)[number];

/** The API's absolute ranges; a book's known page or chapter count lowers the first two. */
export const PROGRESS_MAX: Record<ProgressUnit, number> = {
  pages: 100_000,
  chapters: 10_000,
  percent: 100,
};

export const PROGRESS_UNIT_LABELS: Record<ProgressUnit, string> = {
  pages: 'Pages',
  chapters: 'Chapters',
  percent: 'Percent',
};

export const READING_SORTS = ['recent', 'oldest'] as const;
export type ReadingSort = (typeof READING_SORTS)[number];
export const READING_SORT_LABELS: Record<ReadingSort, string> = {
  recent: 'Newest first',
  oldest: 'Oldest first',
};

export const RATINGS = [1, 2, 3, 4, 5] as const;
export const SUMMARY_MAX = 5_000;

/** The book-level status the overview derives. It is never a field of a book. */
export type BookReadingStatus = 'unread' | 'reading' | 'completed';
