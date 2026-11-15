'use client';

import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { Button, ButtonLink } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { hasErrors, type FieldErrors } from '@/lib/library/form-values';
import {
  BOOK_FORMATS,
  FORMAT_LABELS,
  LIMITS,
  PRIORITY_LABELS,
  WISHLIST_PRIORITIES,
} from '@/lib/library/rules';
import type { WishlistItem } from '@/lib/library/types';
import {
  EMPTY_WISH_FORM,
  newWishPayload,
  validateWishForm,
  wishChanges,
  wishFormValuesOf,
  type WishField,
  type WishFormValues,
} from '@/lib/library/wish-form';
import { ActionError } from './action-error';
import { useBffAction } from './use-bff-action';
import { useFocusFirstInvalid } from './use-focus-first-invalid';

const FIELDS = Object.keys(EMPTY_WISH_FORM) as WishField[];

/** Create (no `wish`) or edit a wishlist item. Status and acquisition are never sent from here. */
export function WishForm({ wish, onDone }: { wish?: WishlistItem; onDone?: () => void }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const [values, setValues] = useState<WishFormValues>(
    wish ? wishFormValuesOf(wish) : EMPTY_WISH_FORM,
  );
  const [errors, setErrors] = useState<FieldErrors<WishField>>({});
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState('');
  const { send, isPending, error } = useBffAction();
  useFocusFirstInvalid(formRef, attempt, errorRef);

  const update = <Field extends WishField>(field: Field, value: WishFormValues[Field]) =>
    setValues((current) => ({ ...current, [field]: value }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;
    setStatus('');
    const problems = validateWishForm(values);
    setErrors(problems);
    if (hasErrors(problems)) {
      setAttempt((count) => count + 1);
      return;
    }
    const body = wish ? wishChanges(wish, values) : newWishPayload(values);
    if (wish && Object.keys(body).length === 0) {
      setStatus('No changes to save.');
      return;
    }
    const result = await send<WishlistItem>(
      wish ? 'PATCH' : 'POST',
      wish ? `/api/library/wishlist/${wish.id}` : '/api/library/wishlist',
      body,
    );
    if (!result) return;
    if (!result.ok) {
      const fieldErrors: FieldErrors<WishField> = {};
      for (const { field, message } of result.error.fields ?? []) {
        if ((FIELDS as string[]).includes(field)) fieldErrors[field as WishField] = message;
      }
      setErrors(fieldErrors);
      setAttempt((count) => count + 1);
      return;
    }
    if (wish) {
      setStatus('Saved.');
      router.refresh();
      onDone?.();
      return;
    }
    router.push(`/library/wishlist/${result.data?.id}?notice=wish-created` as Route);
    router.refresh();
  }

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={submit}
      aria-busy={isPending}
      className="flex flex-col gap-5"
    >
      <ActionError error={error} errorRef={errorRef} />
      <Input
        label="Title"
        required
        maxLength={LIMITS.title}
        value={values.title}
        error={errors.title}
        onChange={(event) => update('title', event.target.value)}
      />
      <Textarea
        label="Authors (optional)"
        hint="One author per line, up to 20."
        rows={2}
        value={values.authors}
        error={errors.authors}
        onChange={(event) => update('authors', event.target.value)}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <Select
          label="Priority"
          value={values.priority}
          onChange={(event) => update('priority', event.target.value as WishFormValues['priority'])}
        >
          {WISHLIST_PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {PRIORITY_LABELS[priority]}
            </option>
          ))}
        </Select>
        <Select
          label="Preferred format"
          value={values.preferredFormat}
          onChange={(event) =>
            update('preferredFormat', event.target.value as WishFormValues['preferredFormat'])
          }
        >
          <option value="">No preference</option>
          {BOOK_FORMATS.map((format) => (
            <option key={format} value={format}>
              {FORMAT_LABELS[format]}
            </option>
          ))}
        </Select>
        <Input
          label="ISBN (optional)"
          maxLength={LIMITS.isbn}
          value={values.isbn}
          error={errors.isbn}
          onChange={(event) => update('isbn', event.target.value)}
        />
        <Input
          label="Where to find it (optional)"
          hint="A shop or reference link. Avuneri never opens it for you."
          type="url"
          inputMode="url"
          maxLength={LIMITS.url}
          value={values.sourceUrl}
          error={errors.sourceUrl}
          onChange={(event) => update('sourceUrl', event.target.value)}
        />
        <Input
          label="Cover image address (optional)"
          type="url"
          inputMode="url"
          maxLength={LIMITS.url}
          value={values.coverUrl}
          error={errors.coverUrl}
          onChange={(event) => update('coverUrl', event.target.value)}
        />
      </div>
      <Textarea
        label="Note (optional)"
        hint="A purchase or research note, e.g. which edition you want."
        rows={3}
        maxLength={LIMITS.wishNote}
        value={values.note}
        error={errors.note}
        onChange={(event) => update('note', event.target.value)}
      />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" aria-disabled={isPending}>
          {isPending ? 'Saving…' : wish ? 'Save changes' : 'Add to wishlist'}
        </Button>
        {wish && onDone ? (
          <Button variant="secondary" onClick={onDone}>
            Cancel
          </Button>
        ) : (
          <ButtonLink href="/library/wishlist" variant="secondary">
            Cancel
          </ButtonLink>
        )}
      </div>
      <p role="status" className="text-sm text-ink-muted">
        {status}
      </p>
    </form>
  );
}
