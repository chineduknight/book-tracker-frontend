'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { readFormValues } from '@/lib/forms/read-form-values';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { hasErrors, type FieldErrors } from '@/lib/library/form-values';
import {
  EMPTY_NAMED_FORM,
  namedChanges,
  namedFormValuesOf,
  newNamedPayload,
  validateNamedForm,
  type NamedField,
  type NamedFormValues,
} from '@/lib/library/named-form';
import { LIMITS } from '@/lib/library/rules';
import { ActionError } from './action-error';
import { useBffAction } from './use-bff-action';
import { useFocusFirstInvalid } from './use-focus-first-invalid';

interface NamedItemFormProps {
  /** e.g. "location", "category", "collection". */
  noun: string;
  /** POST path when creating, PATCH path when editing. */
  path: string;
  item?: { name: string; description?: string | undefined };
  /** Category presets: suggestions that only fill the name field. */
  suggestions?: readonly string[];
  onDone?: () => void;
}

export function NamedItemForm({ noun, path, item, suggestions = [], onDone }: NamedItemFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const initial: NamedFormValues = item ? namedFormValuesOf(item) : EMPTY_NAMED_FORM;
  const [errors, setErrors] = useState<FieldErrors<NamedField>>({});
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState('');
  const { send, isPending, error } = useBffAction();
  useFocusFirstInvalid(formRef, attempt, errorRef);
  const isEdit = item !== undefined;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;
    setStatus('');
    const shown = readFormValues(event.currentTarget, initial);
    const problems = validateNamedForm(shown);
    setErrors(problems);
    if (hasErrors(problems)) {
      setAttempt((count) => count + 1);
      return;
    }
    const body = isEdit ? namedChanges(item, shown) : newNamedPayload(shown);
    if (isEdit && Object.keys(body).length === 0) {
      setStatus('No changes to save.');
      return;
    }

    const result = await send(isEdit ? 'PATCH' : 'POST', path, body);
    if (!result) return;
    if (!result.ok) {
      const fieldErrors: FieldErrors<NamedField> = {};
      for (const { field, message } of result.error.fields ?? []) {
        if (field === 'name' || field === 'description') fieldErrors[field] = message;
      }
      if (result.error.code === 'CONFLICT') fieldErrors.name = result.error.message;
      setErrors(fieldErrors);
      setAttempt((count) => count + 1);
      return;
    }
    setStatus(isEdit ? 'Saved.' : `The ${noun} was created.`);
    if (!isEdit) formRef.current?.reset();
    router.refresh();
    onDone?.();
  }

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={submit}
      aria-busy={isPending}
      className="flex flex-col gap-4"
    >
      <ActionError error={error?.code === 'CONFLICT' ? null : error} errorRef={errorRef} />
      <Input
        label={`${capitalize(noun)} name`}
        name="name"
        maxLength={LIMITS.name}
        required
        defaultValue={initial.name}
        error={errors.name}
      />
      {suggestions.length > 0 ? (
        <div>
          <p className="mb-2 text-xs text-ink-muted">
            Suggestions (fill in the name; nothing is created until you save):
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion) => (
              <Button
                key={suggestion}
                variant="secondary"
                className="min-h-9 px-3 py-1 text-xs"
                onClick={() => {
                  const name = formRef.current?.elements.namedItem('name');
                  if (name instanceof HTMLInputElement) name.value = suggestion;
                }}
              >
                {suggestion}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
      <Textarea
        label="Description (optional)"
        name="description"
        maxLength={LIMITS.groupDescription}
        rows={2}
        defaultValue={initial.description}
        error={errors.description}
      />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" aria-disabled={isPending}>
          {isPending ? 'Saving…' : isEdit ? 'Save changes' : `Add ${noun}`}
        </Button>
        {onDone && isEdit ? (
          <Button variant="secondary" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
      </div>
      <p role="status" className="text-sm text-ink-muted">
        {status}
      </p>
    </form>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
