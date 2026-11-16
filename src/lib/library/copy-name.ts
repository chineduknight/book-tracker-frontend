import type { PhysicalCopy } from './types';

const ADDED_DATE = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' });

/**
 * A permanent short reference for a copy: the end of its API id, where a MongoDB ObjectId keeps its
 * per-insert counter, so copies added in the same second still differ. Never the list position,
 * which shifts whenever a copy is added.
 */
export function copyReference(copy: Pick<PhysicalCopy, 'id'>): string {
  return `#${copy.id.slice(-6)}`;
}

/** The copy's name everywhere it is acted on: rows, Edit and Delete labels, dialogs, loans. */
export function copyName(copy: Pick<PhysicalCopy, 'id' | 'label'>): string {
  return `${copy.label ?? 'Unlabelled copy'} ${copyReference(copy)}`;
}

/** When the copy was recorded (UTC, so the server and the browser render it identically). */
export function copyAddedOn(copy: Pick<PhysicalCopy, 'createdAt'>): string {
  return ADDED_DATE.format(new Date(copy.createdAt));
}
