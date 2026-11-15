'use client';

import { PublicFrame } from '@/components/layout/public-frame';
import { Button, ButtonLink } from '@/components/ui/button';
import { InlineError } from '@/components/ui/inline-error';
import { PageHeader } from '@/components/ui/page-header';

/**
 * Catches failures above the signed-in shell, such as an unreachable session service. Private
 * content is never shown in this state, and the error's details never are either.
 */
export default function RootError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PublicFrame>
      <PageHeader title="Avuneri is unavailable" />
      <InlineError title="Avuneri can’t reach its services right now.">
        <p>Nothing has been lost. Try again in a moment.</p>
      </InlineError>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button onClick={reset}>Try again</Button>
        <ButtonLink href="/login" variant="secondary">
          Go to sign in
        </ButtonLink>
      </div>
    </PublicFrame>
  );
}
