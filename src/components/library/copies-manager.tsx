'use client';

import { Pencil, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  copyChanges,
  copyFormValuesOf,
  EMPTY_COPY_FORM,
  newCopyPayload,
  validateCopyForm,
  type CopyField,
  type CopyFormValues,
} from '@/lib/library/copy-form';
import { hasErrors, type FieldErrors } from '@/lib/library/form-values';
import { CONDITION_LABELS, COPY_CONDITIONS, LIMITS } from '@/lib/library/rules';
import type { PhysicalCopy, StorageLocation } from '@/lib/library/types';
import { ActionError } from './action-error';
import { DeleteButton } from './delete-button';
import { useBffAction } from './use-bff-action';
import { useFocusFirstInvalid } from './use-focus-first-invalid';

interface CopiesManagerProps {
  bookId: string;
  copies: PhysicalCopy[];
  locations: StorageLocation[];
}

/** The physical copies of one physical book. Lending status arrives with the lending milestone. */
export function CopiesManager({ bookId, copies, locations }: CopiesManagerProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const locationName = (id: string | null) =>
    id
      ? (locations.find((location) => location.id === id)?.name ?? 'Unknown location')
      : 'Unassigned';

  return (
    <div className="flex flex-col gap-4">
      {copies.length === 0 ? (
        <p className="text-sm text-ink-muted">No copies recorded yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {copies.map((copy, index) => (
            <li key={copy.id} className="rounded-xl border border-line bg-surface p-4">
              {editingId === copy.id ? (
                <CopyForm
                  bookId={bookId}
                  copy={copy}
                  locations={locations}
                  onDone={() => setEditingId(null)}
                />
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium break-words text-ink">
                      {copy.label ?? `Copy ${index + 1}`}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <Badge>
                        {copy.condition
                          ? CONDITION_LABELS[copy.condition]
                          : 'Condition not assessed'}
                      </Badge>
                      <Badge>{locationName(copy.locationId)}</Badge>
                    </div>
                    {copy.storageNote ? (
                      <p className="mt-2 text-sm break-words whitespace-pre-line text-ink-muted">
                        {copy.storageNote}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => setEditingId(copy.id)}>
                      <Pencil aria-hidden="true" className="size-4" />
                      Edit<span className="sr-only"> {copy.label ?? `copy ${index + 1}`}</span>
                    </Button>
                    <DeleteButton
                      path={`/api/library/copies/${copy.id}`}
                      label="Delete copy"
                      title={`Delete ${copy.label ?? `copy ${index + 1}`}?`}
                    >
                      This copy will disappear from your library. Avuneri keeps its record for
                      lending history; there is no way to restore it from here.
                    </DeleteButton>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {isAdding ? (
        <div className="rounded-xl border border-line bg-surface p-4">
          <h3 className="mb-3 font-serif text-lg font-semibold">Add a copy</h3>
          <CopyForm bookId={bookId} locations={locations} onDone={() => setIsAdding(false)} />
        </div>
      ) : (
        <div>
          <Button variant="secondary" onClick={() => setIsAdding(true)}>
            <Plus aria-hidden="true" className="size-4" />
            Add a copy
          </Button>
        </div>
      )}
    </div>
  );
}

function CopyForm({
  bookId,
  copy,
  locations,
  onDone,
}: {
  bookId: string;
  copy?: PhysicalCopy;
  locations: StorageLocation[];
  onDone: () => void;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const [values, setValues] = useState<CopyFormValues>(
    copy ? copyFormValuesOf(copy) : EMPTY_COPY_FORM,
  );
  const [errors, setErrors] = useState<FieldErrors<CopyField>>({});
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState('');
  const { send, isPending, error } = useBffAction();
  useFocusFirstInvalid(formRef, attempt, errorRef);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;
    const problems = validateCopyForm(values);
    setErrors(problems);
    if (hasErrors(problems)) {
      setAttempt((count) => count + 1);
      return;
    }
    const body = copy ? copyChanges(copy, values) : newCopyPayload(values);
    if (copy && Object.keys(body).length === 0) {
      setStatus('No changes to save.');
      return;
    }
    const result = await send(
      copy ? 'PATCH' : 'POST',
      copy ? `/api/library/copies/${copy.id}` : `/api/library/books/${bookId}/copies`,
      body,
    );
    if (!result) return;
    if (!result.ok) {
      setAttempt((count) => count + 1);
      return;
    }
    router.refresh();
    onDone();
  }

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={submit}
      aria-busy={isPending}
      className="flex flex-col gap-4"
    >
      <ActionError error={error} errorRef={errorRef} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Label (optional)"
          hint="To tell copies apart, e.g. “Signed hardback”."
          maxLength={LIMITS.copyLabel}
          value={values.label}
          error={errors.label}
          onChange={(event) => setValues({ ...values, label: event.target.value })}
        />
        <Select
          label="Condition"
          value={values.condition}
          onChange={(event) =>
            setValues({ ...values, condition: event.target.value as CopyFormValues['condition'] })
          }
        >
          <option value="">Not assessed</option>
          {COPY_CONDITIONS.map((condition) => (
            <option key={condition} value={condition}>
              {CONDITION_LABELS[condition]}
            </option>
          ))}
        </Select>
        <Select
          label="Location"
          hint={locations.length === 0 ? 'Add locations under Library → Locations.' : undefined}
          value={values.locationId}
          onChange={(event) => setValues({ ...values, locationId: event.target.value })}
        >
          <option value="">Unassigned</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </Select>
      </div>
      <Textarea
        label="Storage note (optional)"
        rows={2}
        maxLength={LIMITS.storageNote}
        value={values.storageNote}
        error={errors.storageNote}
        onChange={(event) => setValues({ ...values, storageNote: event.target.value })}
      />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" aria-disabled={isPending}>
          {isPending ? 'Saving…' : copy ? 'Save copy' : 'Add copy'}
        </Button>
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
      <p role="status" className="text-sm text-ink-muted">
        {status}
      </p>
    </form>
  );
}
