import { useId, type ComponentProps } from 'react';
import { cn } from '@/lib/utils';

type SelectProps = Omit<ComponentProps<'select'>, 'id'> & {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  id?: string;
};

/** A labelled native select: accessible and usable on every phone without a custom widget. */
export function Select({ label, hint, error, id, className, children, ...props }: SelectProps) {
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
      <select
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          'min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-base text-ink',
          'aria-invalid:border-danger',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      {error ? (
        <p id={errorId} className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
