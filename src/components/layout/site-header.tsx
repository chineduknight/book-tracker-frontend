import Link from 'next/link';
import { Wordmark } from '@/components/brand/wordmark';
import type { SignedInProfile } from '@/lib/auth/session-api';
import { AccountMenu } from './account-menu';

export function SiteHeader({ profile }: { profile: SignedInProfile }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas pt-[env(safe-area-inset-top)]">
      <div className="flex h-14 items-center justify-between gap-3 px-4 md:px-6">
        <Link href="/" className="flex min-h-11 min-w-0 items-center rounded-md">
          <Wordmark />
        </Link>
        <div data-slot="account" className="flex shrink-0 items-center">
          <AccountMenu name={profile.name} email={profile.email} />
        </div>
      </div>
    </header>
  );
}
