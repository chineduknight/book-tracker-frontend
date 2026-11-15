import { optionalText, textLengthProblem, type FieldErrors } from './form-values';
import { LIMITS, type CopyCondition } from './rules';
import type { PhysicalCopy } from './types';

export interface CopyFormValues {
  label: string;
  /** '' means not assessed. */
  condition: CopyCondition | '';
  storageNote: string;
  /** '' means unassigned. */
  locationId: string;
}

export type CopyField = keyof CopyFormValues;

export const EMPTY_COPY_FORM: CopyFormValues = {
  label: '',
  condition: '',
  storageNote: '',
  locationId: '',
};

export function copyFormValuesOf(copy: PhysicalCopy): CopyFormValues {
  return {
    label: copy.label ?? '',
    condition: copy.condition ?? '',
    storageNote: copy.storageNote ?? '',
    locationId: copy.locationId ?? '',
  };
}

export function validateCopyForm(values: CopyFormValues): FieldErrors<CopyField> {
  return {
    label: textLengthProblem(values.label, LIMITS.copyLabel),
    storageNote: textLengthProblem(values.storageNote, LIMITS.storageNote),
  };
}

/** For POST: omitted fields stay unset; an unassigned copy simply has no locationId. */
export function newCopyPayload(values: CopyFormValues): Record<string, string> {
  const payload: Record<string, string> = {};
  const label = optionalText(values.label);
  const storageNote = optionalText(values.storageNote);
  if (label !== undefined) payload.label = label;
  if (values.condition !== '') payload.condition = values.condition;
  if (storageNote !== undefined) payload.storageNote = storageNote;
  if (values.locationId !== '') payload.locationId = values.locationId;
  return payload;
}

/** For PATCH: changed fields only; null clears a field (locationId: null unassigns). */
export function copyChanges(
  copy: PhysicalCopy,
  values: CopyFormValues,
): Record<string, string | null> {
  const changes: Record<string, string | null> = {};
  const label = optionalText(values.label);
  const storageNote = optionalText(values.storageNote);
  const condition = values.condition === '' ? undefined : values.condition;
  const locationId = values.locationId === '' ? null : values.locationId;
  if (label !== copy.label) changes.label = label ?? null;
  if (condition !== copy.condition) changes.condition = condition ?? null;
  if (storageNote !== copy.storageNote) changes.storageNote = storageNote ?? null;
  if (locationId !== copy.locationId) changes.locationId = locationId;
  return changes;
}
