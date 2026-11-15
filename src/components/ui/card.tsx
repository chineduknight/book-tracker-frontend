import Link from 'next/link';
import type { Route } from 'next';
import type { ComponentProps } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from './badge';

/** A quiet bordered surface for grouping related content. */
export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('rounded-xl border border-line bg-surface p-5 sm:p-6', className)}
      {...props}
    />
  );
}

interface LinkCardProps {
  href: Route;
  title: string;
  description: string;
  icon: LucideIcon;
  /** Optional honest status, e.g. “Coming soon”. */
  status?: string;
  headingLevel?: 'h2' | 'h3';
}

/**
 * A card whose heading is a real link. The link is stretched over the whole card so the entire
 * surface is a touch target, while its accessible name stays just the title.
 */
export function LinkCard({
  href,
  title,
  description,
  icon: Icon,
  status,
  headingLevel: Heading = 'h3',
}: LinkCardProps) {
  return (
    <Card className="relative flex h-full min-w-0 flex-col gap-3 has-[a:hover]:border-line-strong has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-focus motion-safe:transition-colors">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-ink">
          <Icon aria-hidden="true" className="size-5" />
        </span>
        {status ? <Badge>{status}</Badge> : null}
      </div>
      <Heading className="font-serif text-lg font-semibold break-words text-ink">
        <Link
          href={href}
          className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none"
        >
          {title}
        </Link>
      </Heading>
      <p className="text-sm text-ink-muted">{description}</p>
    </Card>
  );
}
