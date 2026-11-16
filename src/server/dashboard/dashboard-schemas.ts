import 'server-only';
import { z } from 'zod';
import { isCalendarDate } from '@/lib/dates/calendar-date';
import {
  ACTIVITY_TYPES,
  type Activity,
  type DashboardSummary,
  type ReadingCounts,
  type ReadingStatistics,
} from '@/lib/dashboard/types';

/*
 * Response schemas for the dashboard. Counts are non-negative integers; the API's documented
 * invariants are checked too, so an inconsistent response fails loudly instead of rendering
 * numbers that contradict each other.
 */
const count = z.number().int().min(0);
const objectId = z.string().regex(/^[0-9a-f]{24}$/);

export const summarySchema: z.ZodType<DashboardSummary> = z
  .object({
    asOf: z.string().refine(isCalendarDate),
    catalogue: z.object({
      totalBooks: count,
      physicalBooks: count,
      ebooks: count,
      physicalCopies: count,
    }),
    reading: z.object({
      unreadBooks: count,
      currentlyReadingBooks: count,
      completedBooks: count,
      booksEverCompleted: count,
      totalSessions: count,
      completedSessions: count,
      rereadSessions: count,
    }),
    notes: z.object({ notes: count, highlights: count }),
    wishlist: z.object({ wanted: count, acquired: count }),
    lending: z.object({ activeLoans: count, overdueLoans: count, returnedLoans: count }),
  })
  .refine(
    ({ catalogue: c, reading: r, lending: l }) =>
      c.totalBooks === c.physicalBooks + c.ebooks &&
      c.totalBooks === r.unreadBooks + r.currentlyReadingBooks + r.completedBooks &&
      r.completedBooks <= r.booksEverCompleted &&
      r.booksEverCompleted <= c.totalBooks &&
      r.completedSessions <= r.totalSessions &&
      l.overdueLoans <= l.activeLoans,
    { message: 'dashboard summary invariants do not hold' },
  );

const readingCounts: z.ZodType<ReadingCounts> = z.object({
  books: z.object({
    total: count,
    unread: count,
    reading: count,
    completed: count,
    everCompleted: count,
  }),
  sessions: z.object({ total: count, inProgress: count, completed: count, rereads: count }),
});

export const statisticsSchema: z.ZodType<ReadingStatistics> = z.object({
  overall: readingCounts,
  byFormat: z.object({ physical: readingCounts, ebook: readingCounts }),
});

export const activitySchema: z.ZodType<Activity> = z.object({
  type: z.enum(ACTIVITY_TYPES),
  resourceId: objectId,
  bookId: objectId.nullable(),
  occurredAt: z.string(),
});
