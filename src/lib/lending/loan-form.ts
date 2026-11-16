import { isCalendarDate } from '@/lib/dates/calendar-date';
import type { FieldErrors } from '@/lib/library/form-values';
import { LOAN_LIMITS } from './rules';
import type { Loan } from './types';

/** The loan fields as the (uncontrolled) inputs hold them. Nothing is prefilled, least of all a date. */
export interface LoanFormValues {
  borrowerName: string;
  borrowerContact: string;
  lentOn: string;
  dueOn: string;
  note: string;
  /** Only meaningful on a returned loan (correction), or in the return dialog. */
  returnedOn: string;
}

export type LoanField = keyof LoanFormValues;

export const EMPTY_LOAN_FORM: LoanFormValues = {
  borrowerName: '',
  borrowerContact: '',
  lentOn: '',
  dueOn: '',
  note: '',
  returnedOn: '',
};

export function loanFormValuesOf(loan: Loan): LoanFormValues {
  return {
    borrowerName: loan.borrowerName,
    borrowerContact: loan.borrowerContact ?? '',
    lentOn: loan.lentOn,
    dueOn: loan.dueOn ?? '',
    note: loan.note ?? '',
    returnedOn: loan.returnedOn ?? '',
  };
}

function textOf(value: string): string | undefined {
  const text = value.trim();
  return text.length > 0 ? text : undefined;
}

function tooLong(value: string, max: number): string | undefined {
  return value.trim().length > max
    ? `Use at most ${max.toLocaleString('en')} characters.`
    : undefined;
}

const REAL_DATE = 'Enter a real date, such as 2026-03-14.';

/**
 * The API's rules, shown on the right field before anything is sent: a borrower name, an explicit
 * lent date, real calendar days, and due and return dates on or after the lent date. Future dates
 * are allowed, as the API allows them. `returned` says whether a return date is required here.
 */
export function validateLoanForm(
  values: LoanFormValues,
  options: { returned: boolean },
): FieldErrors<LoanField> {
  const errors: FieldErrors<LoanField> = {};
  if (values.borrowerName.trim() === '') errors.borrowerName = 'Enter who is borrowing the copy.';
  else errors.borrowerName = tooLong(values.borrowerName, LOAN_LIMITS.borrowerName);
  errors.borrowerContact = tooLong(values.borrowerContact, LOAN_LIMITS.borrowerContact);
  errors.note = tooLong(values.note, LOAN_LIMITS.note);

  if (values.lentOn === '') errors.lentOn = 'Enter the day you lent it.';
  else if (!isCalendarDate(values.lentOn)) errors.lentOn = REAL_DATE;

  const lentOn = isCalendarDate(values.lentOn) ? values.lentOn : undefined;
  if (values.dueOn !== '') {
    if (!isCalendarDate(values.dueOn)) errors.dueOn = REAL_DATE;
    else if (lentOn && values.dueOn < lentOn)
      errors.dueOn = 'The due date can’t be before the lent date.';
  }
  if (options.returned) {
    if (values.returnedOn === '') errors.returnedOn = 'Enter the day it came back.';
    else if (!isCalendarDate(values.returnedOn)) errors.returnedOn = REAL_DATE;
    else if (lentOn && values.returnedOn < lentOn) {
      errors.returnedOn = 'The return date can’t be before the lent date.';
    }
  }
  return errors;
}

export interface NewLoanPayload {
  borrowerName: string;
  lentOn: string;
  borrowerContact?: string;
  dueOn?: string;
  note?: string;
}

/** Call after validation passed. Blank optional fields are omitted; `returnedOn` never is sent. */
export function newLoanPayload(values: LoanFormValues): NewLoanPayload {
  const payload: NewLoanPayload = {
    borrowerName: values.borrowerName.trim(),
    lentOn: values.lentOn,
  };
  const contact = textOf(values.borrowerContact);
  if (contact !== undefined) payload.borrowerContact = contact;
  if (values.dueOn !== '') payload.dueOn = values.dueOn;
  const note = textOf(values.note);
  if (note !== undefined) payload.note = note;
  return payload;
}

export type LoanChanges = {
  borrowerName?: string;
  borrowerContact?: string | null;
  lentOn?: string;
  dueOn?: string | null;
  note?: string | null;
  returnedOn?: string;
};

/**
 * Only what changed; `null` clears contact, due date or note. `returnedOn` is sent only to correct a
 * loan that is already returned, and never as null: a returned loan can't become active again.
 */
export function loanChanges(loan: Loan, values: LoanFormValues): LoanChanges {
  const changes: LoanChanges = {};
  const name = values.borrowerName.trim();
  if (name !== '' && name !== loan.borrowerName) changes.borrowerName = name;
  const contact = textOf(values.borrowerContact);
  if (contact !== loan.borrowerContact) changes.borrowerContact = contact ?? null;
  if (values.lentOn !== '' && values.lentOn !== loan.lentOn) changes.lentOn = values.lentOn;
  const dueOn = values.dueOn === '' ? undefined : values.dueOn;
  if (dueOn !== loan.dueOn) changes.dueOn = dueOn ?? null;
  const note = textOf(values.note);
  if (note !== loan.note) changes.note = note ?? null;
  if (
    loan.returnedOn !== null &&
    values.returnedOn !== '' &&
    values.returnedOn !== loan.returnedOn
  ) {
    changes.returnedOn = values.returnedOn;
  }
  return changes;
}

/** The return date chosen in the dialog: required, real, and not before the lent date. */
export function returnDateProblem(returnedOn: string, lentOn: string): string | undefined {
  if (returnedOn === '') return 'Enter the day it came back.';
  if (!isCalendarDate(returnedOn)) return REAL_DATE;
  if (returnedOn < lentOn) return 'The return date can’t be before the lent date.';
  return undefined;
}
