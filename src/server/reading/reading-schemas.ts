import 'server-only';
import { z } from 'zod';
import { isCalendarDate } from '@/lib/dates/calendar-date';
import { PROGRESS_UNITS, READING_STATUSES, SUMMARY_MAX } from '@/lib/reading/rules';
import type { ReadingOverview, ReadingSession } from '@/lib/reading/types';

/*
 * Request schemas mirror book-tracker-backend's reading.schema.ts exactly: strict objects, one
 * progress metric as an atomic object, real calendar days, `null` only where PATCH may clear.
 * Cross-field rules (dates against the stored session, progress against the book's length) are
 * the API's to enforce against current state; the BFF never guesses them.
 */
const status = z.enum(READING_STATUSES);
const progress = z.discriminatedUnion('unit', [
  z.strictObject({ unit: z.literal('pages'), value: z.number().int().min(0).max(100_000) }),
  z.strictObject({ unit: z.literal('chapters'), value: z.number().int().min(0).max(10_000) }),
  z.strictObject({ unit: z.literal('percent'), value: z.number().int().min(0).max(100) }),
]);
const calendarDate = z
  .string()
  .refine(isCalendarDate, 'must be an existing calendar date in YYYY-MM-DD format');
const rating = z.number().int().min(1).max(5);
const summary = z.string().trim().min(1).max(SUMMARY_MAX);

export const startSessionSchema = z.strictObject({
  status: status.optional(),
  progress: progress.optional(),
  startedOn: calendarDate.optional(),
  completedOn: calendarDate.optional(),
  rating: rating.optional(),
  summary: summary.optional(),
});

export const updateSessionSchema = z
  .strictObject({
    status: status.optional(),
    progress: progress.nullable().optional(),
    startedOn: calendarDate.nullable().optional(),
    completedOn: calendarDate.nullable().optional(),
    rating: rating.nullable().optional(),
    summary: summary.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'must change at least one field',
    when: (payload) => payload.issues.length === 0,
  });

export type StartSession = z.output<typeof startSessionSchema>;
export type UpdateSession = z.output<typeof updateSessionSchema>;

// Response DTOs: anything else from the API fails loudly instead of reaching a page.
const objectId = z.string().regex(/^[0-9a-f]{24}$/);
const responseProgress = z.object({ unit: z.enum(PROGRESS_UNITS), value: z.number().int().min(0) });

export const sessionSchema: z.ZodType<ReadingSession> = z.object({
  id: objectId,
  bookId: objectId,
  status,
  progress: responseProgress.nullable(),
  startedOn: calendarDate.optional(),
  completedOn: calendarDate.optional(),
  rating: rating.optional(),
  summary: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const overviewSchema: z.ZodType<ReadingOverview> = z.object({
  bookId: objectId,
  status: z.enum(['unread', 'reading', 'completed']),
  totalSessions: z.number().int().min(0),
  completedSessions: z.number().int().min(0),
  activeSession: sessionSchema.nullable(),
  lastCompletedSession: sessionSchema.nullable(),
});
