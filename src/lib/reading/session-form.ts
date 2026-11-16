import { isCalendarDate } from '@/lib/dates/calendar-date';
import type { FieldErrors } from '@/lib/library/form-values';
import {
  PROGRESS_MAX,
  PROGRESS_UNITS,
  SUMMARY_MAX,
  type ProgressUnit,
  type ReadingStatus,
} from './rules';
import type { ReadingProgress, ReadingSession } from './types';

/**
 * Form values for a reading session, as the (uncontrolled) fields hold them. Every field is
 * optional: nothing is filled in automatically, least of all a date.
 */
export interface SessionFormValues {
  /** '' means progress is not recorded. */
  progressUnit: ProgressUnit | '';
  progressValue: string;
  startedOn: string;
  completedOn: string;
  /** '' or '1'–'5'. */
  rating: string;
  summary: string;
}

export type SessionField = keyof SessionFormValues;

export const EMPTY_SESSION_FORM: SessionFormValues = {
  progressUnit: '',
  progressValue: '',
  startedOn: '',
  completedOn: '',
  rating: '',
  summary: '',
};

/** A book's current lengths, when known; they cap page and chapter progress as the API does. */
export interface BookLengths {
  pageCount?: number | undefined;
  chapterCount?: number | undefined;
}

export function sessionFormValuesOf(session: ReadingSession): SessionFormValues {
  return {
    progressUnit: session.progress?.unit ?? '',
    progressValue: session.progress ? String(session.progress.value) : '',
    startedOn: session.startedOn ?? '',
    completedOn: session.completedOn ?? '',
    rating: session.rating === undefined ? '' : String(session.rating),
    summary: session.summary ?? '',
  };
}

/** The highest value allowed for a unit, given what is known about the book. */
export function progressMaximum(unit: ProgressUnit, lengths: BookLengths): number {
  if (unit === 'pages' && lengths.pageCount !== undefined) return lengths.pageCount;
  if (unit === 'chapters' && lengths.chapterCount !== undefined) return lengths.chapterCount;
  return PROGRESS_MAX[unit];
}

export function progressHint(lengths: BookLengths): string {
  const known = [
    lengths.pageCount === undefined ? undefined : `${lengths.pageCount} pages`,
    lengths.chapterCount === undefined ? undefined : `${lengths.chapterCount} chapters`,
  ].filter(Boolean);
  const base = 'Record where you are, in pages, chapters or percent. Going back is fine.';
  const end = ' Reaching the end does not finish the reading; you do that yourself.';
  return known.length > 0 ? `${base} This book has ${known.join(' and ')}.${end}` : `${base}${end}`;
}

function isUnit(value: string): value is ProgressUnit {
  return (PROGRESS_UNITS as readonly string[]).includes(value);
}

/** The progress the form describes, or undefined when it describes none (or is invalid). */
export function progressOf(values: SessionFormValues): ReadingProgress | undefined {
  const text = values.progressValue.trim();
  if (!isUnit(values.progressUnit) || !/^[0-9]+$/.test(text)) return undefined;
  return { unit: values.progressUnit, value: Number(text) };
}

function ratingOf(values: SessionFormValues): number | undefined {
  return /^[1-5]$/.test(values.rating) ? Number(values.rating) : undefined;
}

function textOf(value: string): string | undefined {
  const text = value.trim();
  return text.length > 0 ? text : undefined;
}

const UNIT_NOUN: Record<ProgressUnit, string> = {
  pages: 'pages',
  chapters: 'chapters',
  percent: 'percent',
};

/**
 * The API's rules, checked before sending so the reader sees them next to the right field: whole
 * numbers within range (and within the book's known length), real calendar days, a finish date only
 * on a finished reading and never before the start. Progress may go down: re-reading a chapter or
 * correcting a typo is normal, so no "only forwards" rule is invented.
 */
export function validateSessionForm(
  values: SessionFormValues,
  context: { status: ReadingStatus; lengths: BookLengths },
): FieldErrors<SessionField> {
  const errors: FieldErrors<SessionField> = {};
  const valueText = values.progressValue.trim();

  if (values.progressUnit === '' && valueText !== '') {
    errors.progressUnit = 'Choose pages, chapters or percent, or clear the amount.';
  } else if (isUnit(values.progressUnit)) {
    if (valueText === '') {
      errors.progressValue = 'Enter how far you are, or set the unit to “Not recorded”.';
    } else if (!/^[0-9]+$/.test(valueText)) {
      errors.progressValue = 'Enter a whole number, such as 42.';
    } else {
      const maximum = progressMaximum(values.progressUnit, context.lengths);
      const known =
        (values.progressUnit === 'pages' && context.lengths.pageCount !== undefined) ||
        (values.progressUnit === 'chapters' && context.lengths.chapterCount !== undefined);
      if (Number(valueText) > maximum) {
        errors.progressValue = known
          ? `This book has ${maximum} ${UNIT_NOUN[values.progressUnit]}; enter at most ${maximum}.`
          : `Enter at most ${maximum.toLocaleString('en')} ${UNIT_NOUN[values.progressUnit]}.`;
      }
    }
  }

  if (values.startedOn !== '' && !isCalendarDate(values.startedOn)) {
    errors.startedOn = 'Enter a real date, such as 2026-03-14.';
  }
  if (values.completedOn !== '') {
    if (!isCalendarDate(values.completedOn)) {
      errors.completedOn = 'Enter a real date, such as 2026-03-14.';
    } else if (context.status !== 'completed') {
      errors.completedOn = 'A finish date can only be set on a finished reading.';
    } else if (isCalendarDate(values.startedOn) && values.completedOn < values.startedOn) {
      errors.completedOn = 'The finish date can’t be before the start date.';
    }
  }

  if (values.rating !== '' && ratingOf(values) === undefined)
    errors.rating = 'Choose 1 to 5 stars.';
  if (values.summary.trim().length > SUMMARY_MAX) {
    errors.summary = `Use at most ${SUMMARY_MAX.toLocaleString('en')} characters.`;
  }
  return errors;
}

export type NewSessionPayload = {
  status?: 'completed';
  progress?: ReadingProgress;
  startedOn?: string;
  completedOn?: string;
  rating?: number;
  summary?: string;
};

/**
 * A new reading: in progress by default (the API's default, so `status` is omitted), or a finished
 * read recorded after the fact. Blank fields are omitted; no date is ever invented.
 */
export function newSessionPayload(
  values: SessionFormValues,
  kind: 'start' | 'finished',
): NewSessionPayload {
  const payload: NewSessionPayload = kind === 'finished' ? { status: 'completed' } : {};
  const progress = progressOf(values);
  if (progress) payload.progress = progress;
  if (values.startedOn !== '') payload.startedOn = values.startedOn;
  if (kind === 'finished' && values.completedOn !== '') payload.completedOn = values.completedOn;
  const rating = ratingOf(values);
  if (rating !== undefined) payload.rating = rating;
  const summary = textOf(values.summary);
  if (summary !== undefined) payload.summary = summary;
  return payload;
}

export type SessionChanges = {
  status?: 'completed';
  progress?: ReadingProgress | null;
  startedOn?: string | null;
  completedOn?: string | null;
  rating?: number | null;
  summary?: string | null;
};

/**
 * Only what the reader changed: `null` clears, progress is replaced as one object, and `status` is
 * only ever sent as `completed` (a finished reading can never be reopened). An empty result means
 * nothing to save and no request is made.
 */
export function sessionChanges(
  session: ReadingSession,
  values: SessionFormValues,
  options: { finish?: boolean } = {},
): SessionChanges {
  const changes: SessionChanges = {};
  if (options.finish && session.status === 'in_progress') changes.status = 'completed';

  const progress = progressOf(values);
  const before = session.progress;
  if (progress === undefined) {
    if (before !== null) changes.progress = null;
  } else if (!before || before.unit !== progress.unit || before.value !== progress.value) {
    changes.progress = progress;
  }

  for (const field of ['startedOn', 'completedOn'] as const) {
    const next = values[field] === '' ? undefined : values[field];
    if (next !== session[field]) changes[field] = next ?? null;
  }
  const rating = ratingOf(values);
  if (rating !== session.rating) changes.rating = rating ?? null;
  const summary = textOf(values.summary);
  if (summary !== session.summary) changes.summary = summary ?? null;
  return changes;
}
