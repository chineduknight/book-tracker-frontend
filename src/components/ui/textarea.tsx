import { useId, type ComponentProps } from 'react';
import { cn } from '@/lib/utils';

type TextareaProps = Omit<ComponentProps<'textarea'>, 'id'> & {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  id?: string;
};

/** A labelled multi-line field with linked hint and error, matching `Input`. */
export function Textarea({ label, hint, error, id, className, ...props }: TextareaProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-sm font-medium text-ink">
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}
      <textarea
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          'min-h-24 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-base text-ink',
          'aria-invalid:border-danger',
          className,
        )}
        {...props}
      />
      {error ? (
        <p id={errorId} className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
