import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SignInForm } from '@/components/auth/sign-in-form';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { safeReturnPath, withReturnPath } from '@/lib/auth/safe-redirect';
import { hasActiveSession } from '@/server/current-session';

export const metadata: Metadata = { title: 'Sign in' };

const SIGNED_OUT_NOTICES: Record<string, string> = {
  '1': 'You have signed out.',
  unconfirmed:
    'You are signed out on this device. Avuneri could not confirm this with its server, so the session there will end on its own when it expires.',
};

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { next, signedOut } = await searchParams;
  const returnPath = safeReturnPath(next);
  if (await hasActiveSession()) redirect(returnPath as Route);
  const notice = typeof signedOut === 'string' ? SIGNED_OUT_NOTICES[signedOut] : undefined;

  return (
    <>
      <PageHeader title="Sign in" description="Welcome back to your library." />
      {notice ? (
        <p
          role="status"
          className="mb-6 rounded-xl border border-line bg-surface-muted p-4 text-sm text-ink"
        >
          {notice}
        </p>
      ) : null}
      <Card>
        <SignInForm returnPath={returnPath} />
      </Card>
      <p className="mt-6 text-center text-sm text-ink-muted">
        New to Avuneri?{' '}
        <Link
          href={withReturnPath('/register', returnPath) as Route}
          className="font-medium text-accent underline underline-offset-4 hover:text-accent-hover"
        >
          Create an account
        </Link>
      </p>
    </>
  );
}
