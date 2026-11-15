import type { ReactNode } from 'react';
import type { SignedInProfile } from '@/lib/auth/session-api';
import { PrimaryNavigation } from './primary-navigation';
import { SiteHeader } from './site-header';

/**
 * The app frame: header, primary navigation and the page's single `<main>`. On phones the main
 * column reserves space for the fixed bottom bar and the device safe area, so the last line of
 * content is never hidden behind the navigation.
 */
export function AppShell({ profile, children }: { profile: SignedInProfile; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader profile={profile} />
      <div className="flex flex-1 md:items-start">
        <PrimaryNavigation />
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-4xl min-w-0 flex-1 px-4 pt-6 pb-[calc(var(--spacing-nav)+env(safe-area-inset-bottom)+2rem)] focus:outline-none sm:px-6 md:px-8 md:pt-10 md:pb-16"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
