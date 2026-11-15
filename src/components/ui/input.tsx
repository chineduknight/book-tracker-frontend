import { useId, type ComponentProps } from 'react';
import { cn } from '@/lib/utils';

type InputProps = Omit<ComponentProps<'input'>, 'id'> & {
  /** Visible label. Inputs are never labelled by placeholder alone. */
  label: string;
  hint?: string;
  error?: string;
  id?: string;
};

/** A labelled text input whose hint and error are linked through `aria-describedby`. */
export function Input({ label, hint, error, id, className, ...props }: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-ink">
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          'min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-base text-ink',
          'placeholder:text-ink-muted disabled:cursor-not-allowed disabled:opacity-60',
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
