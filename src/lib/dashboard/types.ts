/** Read-only, server-derived Home metrics, exactly as book-tracker-backend's dashboard returns them. */
export interface DashboardSummary {
  /** The reference day for overdue loans only: the requested day, or today in UTC. */
  asOf: string;
  catalogue: { totalBooks: number; physicalBooks: number; ebooks: number; physicalCopies: number };
  reading: {
    unreadBooks: number;
    currentlyReadingBooks: number;
    completedBooks: number;
    booksEverCompleted: number;
    totalSessions: number;
    completedSessions: number;
    rereadSessions: number;
  };
  notes: { notes: number; highlights: number };
  wishlist: { wanted: number; acquired: number };
  lending: { activeLoans: number; overdueLoans: number; returnedLoans: number };
}

export interface ReadingCounts {
  books: {
    total: number;
    unread: number;
    reading: number;
    completed: number;
    everCompleted: number;
  };
  sessions: { total: number; inProgress: number; completed: number; rereads: number };
}

export interface ReadingStatistics {
  overall: ReadingCounts;
  byFormat: { physical: ReadingCounts; ebook: ReadingCounts };
}

export const ACTIVITY_TYPES = [
  'book_added',
  'reading_session_recorded',
  'note_added',
  'highlight_added',
  'wishlist_item_added',
  'loan_recorded',
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** A newly recorded resource. There are no events for edits, returns, completions or deletions. */
export interface Activity {
  type: ActivityType;
  resourceId: string;
  bookId: string | null;
  occurredAt: string;
}

/** Accurate labels for a creation event; never "finished" or "returned". */
export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  book_added: 'Book added',
  reading_session_recorded: 'Reading recorded',
  note_added: 'Note added',
  highlight_added: 'Highlight added',
  wishlist_item_added: 'Wish added',
  loan_recorded: 'Loan recorded',
};
