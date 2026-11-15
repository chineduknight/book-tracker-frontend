import { CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

interface InlineErrorProps {
  title: string;
  children?: ReactNode;
  /** The API request id, shown so a problem can be traced without exposing anything sensitive. */
  requestId?: string;
}

/**
 * An inline error announced to assistive technology. Render it only for an actual error: the
 * `alert` role interrupts screen-reader users.
 */
export function InlineError({ title, children, requestId }: InlineErrorProps) {
  return (
    <div
      role="alert"
      className="flex gap-3 rounded-xl border border-danger/40 bg-danger-soft p-4 text-sm text-ink"
    >
      <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-danger" />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-semibold text-danger">{title}</p>
        {children ? <div className="text-ink">{children}</div> : null}
        {requestId ? (
          <p className="text-xs break-all text-ink-muted">
            Reference: <code>{requestId}</code>
          </p>
        ) : null}
      </div>
    </div>
  );
}
