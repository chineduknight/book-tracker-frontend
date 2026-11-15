import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { RegisterForm } from '@/components/auth/register-form';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { safeReturnPath, withReturnPath } from '@/lib/auth/safe-redirect';
import { hasActiveSession } from '@/server/current-session';

export const metadata: Metadata = { title: 'Create an account' };

export default async function RegisterPage({ searchParams }: PageProps<'/register'>) {
  const { next } = await searchParams;
  const returnPath = safeReturnPath(next);
  if (await hasActiveSession()) redirect(returnPath as Route);

  return (
    <>
      <PageHeader
        title="Create your account"
        description="A private place for your books, your reading and what you take from them."
      />
      <Card>
        <RegisterForm returnPath={returnPath} />
      </Card>
      <p className="mt-6 text-center text-sm text-ink-muted">
        Already have an account?{' '}
        <Link
          href={withReturnPath('/login', returnPath) as Route}
          className="font-medium text-accent underline underline-offset-4 hover:text-accent-hover"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}
