'use client';

import { Button, ButtonLink } from '@/components/ui/button';
import { InlineError } from '@/components/ui/inline-error';
import { PageHeader } from '@/components/ui/page-header';

/**
 * Route error boundary. It never shows the error's message or stack: they can contain internal
 * details. Next.js logs the full error on the server.
 */
export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <>
      <PageHeader title="Something went wrong" />
      <InlineError title="This page could not be shown.">
        <p>Try again. If the problem continues, go back to Home.</p>
      </InlineError>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button onClick={reset}>Try again</Button>
        <ButtonLink href="/" variant="secondary">
          Go to Home
        </ButtonLink>
      </div>
    </>
  );
}
