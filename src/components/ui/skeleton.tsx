import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * A placeholder shape for content that is genuinely loading. It is hidden from assistive technology:
 * the loading region itself should carry `aria-busy` and a text status. Never leave one on screen
 * as a permanent placeholder.
 */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden="true"
      className={cn('rounded-md bg-surface-muted motion-safe:animate-pulse', className)}
      {...props}
    />
  );
}
