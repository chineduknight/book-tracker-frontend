import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** A small, non-interactive status label, e.g. “Coming soon”. */
export function Badge({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-line bg-surface-muted px-2.5 py-0.5',
        'text-xs leading-5 font-medium text-ink-muted',
        className,
      )}
      {...props}
    />
  );
}
