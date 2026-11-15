import type { Route } from 'next';
import type { LucideIcon } from 'lucide-react';
import { ButtonLink } from './button';

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: LucideIcon;
  /** An optional real destination. Empty states never offer actions that do nothing. */
  action?: { href: Route; label: string };
  headingLevel?: 'h2' | 'h3';
}

export function EmptyState({
  title,
  description,
  icon: Icon,
  action,
  headingLevel: Heading = 'h2',
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line-strong bg-surface px-6 py-10 text-center">
      {Icon ? (
        <span className="grid size-12 place-items-center rounded-full bg-accent-soft text-accent-ink">
          <Icon aria-hidden="true" className="size-6" />
        </span>
      ) : null}
      <Heading className="font-serif text-xl font-semibold break-words text-ink">{title}</Heading>
      <p className="max-w-prose text-sm text-ink-muted">{description}</p>
      {action ? (
        <ButtonLink href={action.href} variant="secondary" className="mt-2">
          {action.label}
        </ButtonLink>
      ) : null}
    </div>
  );
}
