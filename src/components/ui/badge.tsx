import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** A small, non-interactive status label, e.g. “Coming soon”. */
export function Badge({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      className={cn(
        'inline-flex min-w-0 max-w-full items-center rounded-full border border-line bg-surface-muted px-2.5 py-0.5 wrap-anywhere',
        'text-xs leading-5 font-medium text-ink-muted',
        className,
      )}
      {...props}
    />
  );
}
