'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { sendToBff } from '@/lib/bff/bff-client';
import { formatCalendarDate } from '@/lib/dates/calendar-date';
import type { CopyLoanOverview } from '@/lib/lending/types';

type Status =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'failed' }
  | { state: 'ready'; overview: CopyLoanOverview };

const linkClass = 'font-medium text-accent hover:text-accent-hover';

/**
 * A copy's loan status, fetched only when asked (one request for one copy, so a book with many
 * copies never fans out). A failed check says so: it is never shown as "available".
 */
export function CopyLoanStatus({ copyId, copyLabel }: { copyId: string; copyLabel: string }) {
  const [status, setStatus] = useState<Status>({ state: 'idle' });

  async function check() {
    setStatus({ state: 'loading' });
    const result = await sendToBff<CopyLoanOverview>(
      'GET',
      `/api/lending/copies/${copyId}/overview`,
    );
    setStatus(
      result.ok && result.data ? { state: 'ready', overview: result.data } : { state: 'failed' },
    );
  }

  const loan = status.state === 'ready' ? status.overview.activeLoan : null;
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div aria-live="polite" className="text-ink-muted">
        {status.state === 'loading' ? 'Checking…' : null}
        {status.state === 'failed' ? (
          <span className="text-danger">Couldn’t check whether it’s on loan. Try again.</span>
        ) : null}
        {status.state === 'ready' && loan ? (
          <span className="text-ink">
            On loan to {loan.borrowerName} since {formatCalendarDate(loan.lentOn)}.{' '}
            <Link href={`/lending/${loan.id}` as Route} className={linkClass}>
              View loan
            </Link>
          </span>
        ) : null}
        {status.state === 'ready' && !loan ? (
          <span className="text-ink">
            Not on loan.{' '}
            <Link href={`/lending/new?copyId=${copyId}` as Route} className={linkClass}>
              Lend this copy
            </Link>
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {status.state === 'ready' ? null : (
          <Button
            variant="secondary"
            className="min-h-11 min-w-0 max-w-full"
            aria-disabled={status.state === 'loading'}
            aria-label={`Check loan status of ${copyLabel}`}
            onClick={() => {
              if (status.state !== 'loading') void check();
            }}
          >
            <span className="min-w-0 wrap-anywhere">Check loan status</span>
          </Button>
        )}
        <Link
          href={`/lending/copies/${copyId}` as Route}
          aria-label={`Loan history of ${copyLabel}`}
          className={`${linkClass} min-h-11 content-center`}
        >
          Loan history
        </Link>
      </div>
    </div>
  );
}
