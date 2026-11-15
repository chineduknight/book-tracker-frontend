import {
  optionalText,
  requiredTitleProblem,
  textLengthProblem,
  type FieldErrors,
} from './form-values';
import { collapseWhitespace, LIMITS } from './rules';

/** Locations, categories and collections: a required name and an optional description. */
export interface NamedFormValues {
  name: string;
  description: string;
}

export type NamedField = keyof NamedFormValues;

export const EMPTY_NAMED_FORM: NamedFormValues = { name: '', description: '' };

export function namedFormValuesOf(item: {
  name: string;
  description?: string | undefined;
}): NamedFormValues {
  return { name: item.name, description: item.description ?? '' };
}

export function validateNamedForm(values: NamedFormValues): FieldErrors<NamedField> {
  const nameProblem = requiredTitleProblem(values.name, LIMITS.name);
  return {
    name: nameProblem === 'Enter a title.' ? 'Enter a name.' : nameProblem,
    description: textLengthProblem(values.description, LIMITS.groupDescription),
  };
}

export function newNamedPayload(values: NamedFormValues): Record<string, string> {
  const description = optionalText(values.description);
  return {
    name: collapseWhitespace(values.name),
    ...(description === undefined ? {} : { description }),
  };
}

export function namedChanges(
  item: { name: string; description?: string | undefined },
  values: NamedFormValues,
): Record<string, string | null> {
  const changes: Record<string, string | null> = {};
  const name = collapseWhitespace(values.name);
  const description = optionalText(values.description);
  if (name !== item.name) changes.name = name;
  if (description !== item.description) changes.description = description ?? null;
  return changes;
}
