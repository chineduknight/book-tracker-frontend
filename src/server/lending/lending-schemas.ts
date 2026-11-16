import 'server-only';
import { z } from 'zod';
import { isCalendarDate } from '@/lib/dates/calendar-date';
import { LOAN_LIMITS } from '@/lib/lending/rules';
import type { CopyLoanOverview, Loan } from '@/lib/lending/types';

/*
 * Request schemas mirror book-tracker-backend's loan.schema.ts exactly: strict objects, trimmed text,
 * real calendar days, `null` only where PATCH may clear, and no `returnedOn` on create. Date order
 * is checked by the API against the merged loan; the BFF never guesses stored state.
 */
const calendarDate = z
  .string()
  .refine(isCalendarDate, 'must be an existing calendar date in YYYY-MM-DD format');
const borrowerName = z.string().trim().min(1).max(LOAN_LIMITS.borrowerName);
const borrowerContact = z.string().trim().min(1).max(LOAN_LIMITS.borrowerContact);
const note = z.string().trim().min(1).max(LOAN_LIMITS.note);

export const createLoanSchema = z.strictObject({
  borrowerName,
  borrowerContact: borrowerContact.optional(),
  lentOn: calendarDate,
  dueOn: calendarDate.optional(),
  note: note.optional(),
});

export const updateLoanSchema = z
  .strictObject({
    borrowerName: borrowerName.optional(),
    borrowerContact: borrowerContact.nullable().optional(),
    lentOn: calendarDate.optional(),
    dueOn: calendarDate.nullable().optional(),
    note: note.nullable().optional(),
    returnedOn: calendarDate.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'must change at least one field',
    when: (payload) => payload.issues.length === 0,
  });

export const returnLoanSchema = z.strictObject({ returnedOn: calendarDate });

export type CreateLoan = z.output<typeof createLoanSchema>;
export type UpdateLoan = z.output<typeof updateLoanSchema>;

const objectId = z.string().regex(/^[0-9a-f]{24}$/);

export const loanSchema: z.ZodType<Loan> = z.object({
  id: objectId,
  copyId: objectId,
  bookId: objectId,
  borrowerName: z.string(),
  borrowerContact: z.string().optional(),
  lentOn: calendarDate,
  dueOn: calendarDate.optional(),
  returnedOn: calendarDate.nullable(),
  note: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const copyLoanOverviewSchema: z.ZodType<CopyLoanOverview> = z
  .object({ copyId: objectId, isOnLoan: z.boolean(), activeLoan: loanSchema.nullable() })
  .refine((overview) => overview.isOnLoan === (overview.activeLoan !== null), {
    message: 'isOnLoan must match activeLoan',
  });
