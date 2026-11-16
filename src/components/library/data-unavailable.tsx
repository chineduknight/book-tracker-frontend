import Link from 'next/link';
import type { Route } from 'next';
import { InlineError } from '@/components/ui/inline-error';

/**
 * Shown when private data could not be loaded. Deliberately distinct from every empty state: an
 * outage must never look like an empty library.
 */
export function DataUnavailable({
  what,
  retryHref,
  retryAfterSeconds,
}: {
  what: string;
  retryHref: string;
  retryAfterSeconds?: number | undefined;
}) {
  return (
    <div className="flex flex-col gap-4">
      <InlineError title={`Your ${what} couldn’t be loaded.`}>
        <p>
          {retryAfterSeconds
            ? `Avuneri is receiving too many requests. Try again in about ${Math.max(1, Math.ceil(retryAfterSeconds / 60))} minute(s).`
            : 'Avuneri can’t reach its server right now. Nothing has been lost.'}
        </p>
      </InlineError>
      <Link
        href={retryHref as Route}
        className="inline-flex min-h-11 w-fit items-center rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-muted"
      >
        Try again
      </Link>
    </div>
  );
}
