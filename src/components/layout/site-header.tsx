import Link from 'next/link';
import { Wordmark } from '@/components/brand/wordmark';
import type { SignedInProfile } from '@/lib/auth/session-api';
import { AccountMenu } from './account-menu';

/**
 * The header is a size container: what it shows depends on the room it actually has, so enlarged
 * text (which scales every `rem`) and narrow phones get the same treatment. When the wordmark and
 * the account button cannot share a row, the brand name becomes screen-reader text beside the
 * logo; if anything still does not fit, the row wraps rather than letting the two overlap.
 */
export function SiteHeader({ profile }: { profile: SignedInProfile }) {
  return (
    <header className="@container/header sticky top-0 z-30 [@media(height<30rem)]:static border-b border-line bg-canvas pt-[env(safe-area-inset-top)]">
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-x-3 px-4 shell-wide:px-6">
        <Link href="/" className="flex min-h-11 min-w-11 items-center rounded-md">
          <Wordmark collapsible />
        </Link>
        <div data-slot="account" className="ml-auto flex items-center">
          <AccountMenu name={profile.name} email={profile.email} />
        </div>
      </div>
    </header>
  );
}
