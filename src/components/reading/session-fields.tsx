import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { WholeNumberInput } from '@/components/ui/whole-number-input';
import type { FieldErrors } from '@/lib/library/form-values';
import { PROGRESS_MAX, PROGRESS_UNITS, PROGRESS_UNIT_LABELS, RATINGS } from '@/lib/reading/rules';
import {
  progressHint,
  type BookLengths,
  type SessionField,
  type SessionFormValues,
} from '@/lib/reading/session-form';

/** Maps the BFF's field names (e.g. `progress.value`) onto this form's fields. */
export function sessionFieldOf(field: string): SessionField | undefined {
  if (field === 'progress' || field === 'progress.value') return 'progressValue';
  if (field === 'progress.unit') return 'progressUnit';
  const known: readonly string[] = ['startedOn', 'completedOn', 'rating', 'summary'];
  return known.includes(field) ? (field as SessionField) : undefined;
}

/**
 * The editable parts of a reading, as uncontrolled fields: text typed before the page is
 * interactive is never replaced. Dates are native date inputs holding `YYYY-MM-DD` calendar days.
 */
export function SessionFields({
  initial,
  errors,
  lengths,
  completedOn,
}: {
  initial: SessionFormValues;
  errors: FieldErrors<SessionField>;
  lengths: BookLengths;
  /** Whether the finish date is shown; it only applies to a finished reading. */
  completedOn: 'shown' | 'hidden' | 'absent';
}) {
  return (
    <div className="flex flex-col gap-5">
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-ink">Progress (optional)</legend>
        <p id="progress-hint" className="text-xs text-ink-muted">
          {progressHint(lengths)}
        </p>
        <div className="grid gap-3 @md:grid-cols-2 [&>*]:min-w-0">
          <Select
            label="Measured in"
            name="progressUnit"
            defaultValue={initial.progressUnit}
            error={errors.progressUnit}
          >
            <option value="">Not recorded</option>
            {PROGRESS_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {PROGRESS_UNIT_LABELS[unit]}
              </option>
            ))}
          </Select>
          <WholeNumberInput
            label="Amount"
            max={PROGRESS_MAX.pages}
            name="progressValue"
            defaultValue={initial.progressValue}
            error={errors.progressValue}
          />
        </div>
      </fieldset>
      <div className="grid gap-5 @md:grid-cols-2 [&>*]:min-w-0">
        <Input
          label="Started on (optional)"
          name="startedOn"
          type="date"
          hint="Leave blank if you don’t know. No date is ever filled in for you."
          defaultValue={initial.startedOn}
          error={errors.startedOn}
        />
        {completedOn === 'absent' ? null : (
          <div hidden={completedOn === 'hidden'}>
            <Input
              label="Finished on (optional)"
              name="completedOn"
              type="date"
              hint="Only for a finished reading, and not before the start date."
              defaultValue={initial.completedOn}
              error={errors.completedOn}
            />
          </div>
        )}
      </div>
      <Select
        label="Rating (optional)"
        name="rating"
        defaultValue={initial.rating}
        error={errors.rating}
      >
        <option value="">No rating</option>
        {RATINGS.map((stars) => (
          <option key={stars} value={String(stars)}>
            {stars} {stars === 1 ? 'star' : 'stars'}
          </option>
        ))}
      </Select>
      <Textarea
        label="Summary (optional)"
        name="summary"
        hint="A few words about this reading, up to 5,000 characters. Notes and quotes have their own place."
        rows={3}
        defaultValue={initial.summary}
        error={errors.summary}
      />
    </div>
  );
}
