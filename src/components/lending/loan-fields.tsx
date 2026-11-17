import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { FieldErrors } from '@/lib/library/form-values';
import type { LoanField, LoanFormValues } from '@/lib/lending/loan-form';

const FIELDS: readonly LoanField[] = [
  'borrowerName',
  'borrowerContact',
  'lentOn',
  'dueOn',
  'note',
  'returnedOn',
];

export function loanFieldOf(field: string): LoanField | undefined {
  return (FIELDS as readonly string[]).includes(field) ? (field as LoanField) : undefined;
}

/**
 * The loan's details as uncontrolled fields, so typing before the page is interactive is kept.
 * Dates are native date inputs holding calendar days; none is filled in for the reader.
 */
export function LoanFields({
  initial,
  errors,
  showReturnedOn = false,
}: {
  initial: LoanFormValues;
  errors: FieldErrors<LoanField>;
  /** Only on a loan that was already returned, to correct its date. */
  showReturnedOn?: boolean;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 @md:grid-cols-2 [&>*]:min-w-0">
        <Input
          label="Borrower"
          name="borrowerName"
          autoComplete="off"
          hint="Who has the copy. Up to 160 characters."
          defaultValue={initial.borrowerName}
          error={errors.borrowerName}
          aria-required="true"
        />
        <Input
          label="Contact (optional)"
          name="borrowerContact"
          autoComplete="off"
          hint="A phone number or email for you. Avuneri never contacts anyone."
          defaultValue={initial.borrowerContact}
          error={errors.borrowerContact}
        />
        <Input
          label="Lent on"
          name="lentOn"
          type="date"
          hint="The day the copy left your hands."
          defaultValue={initial.lentOn}
          error={errors.lentOn}
          aria-required="true"
        />
        <Input
          label="Due back (optional)"
          name="dueOn"
          type="date"
          hint="Not before the lent date. Without one, a loan is never overdue."
          defaultValue={initial.dueOn}
          error={errors.dueOn}
        />
        {showReturnedOn ? (
          <Input
            label="Returned on"
            name="returnedOn"
            type="date"
            hint="Correct the recorded return day. The loan stays returned."
            defaultValue={initial.returnedOn}
            error={errors.returnedOn}
            aria-required="true"
          />
        ) : null}
      </div>
      <Textarea
        label="Note (optional)"
        name="note"
        hint="Up to 2,000 characters, e.g. the condition it left in."
        rows={3}
        defaultValue={initial.note}
        error={errors.note}
      />
    </div>
  );
}
