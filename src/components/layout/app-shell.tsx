import type { ReactNode } from 'react';
import type { SignedInProfile } from '@/lib/auth/session-api';
import { KeepFocusVisible } from './keep-focus-visible';
import { PrimaryNavigation } from './primary-navigation';
import { SiteHeader } from './site-header';

/**
 * The app frame: header, primary navigation and the page's single `<main>`. On phones the main
 * column reserves space for the fixed bottom bar and the device safe area, so the last line of
 * content is never hidden behind the navigation.
 *
 * `main` is a size container: layouts inside it (two-column forms, card grids, list rows) switch on
 * the width of the content column, not the viewport. The column narrows when the sidebar appears
 * and when text is enlarged, which a viewport media query cannot see.
 */
export function AppShell({ profile, children }: { profile: SignedInProfile; children: ReactNode }) {
  return (
    <div className="@container/shell flex min-h-dvh flex-col">
      <KeepFocusVisible />
      <SiteHeader profile={profile} />
      <div className="flex flex-1 shell-wide:items-start">
        <PrimaryNavigation />
        <main
          id="main-content"
          tabIndex={-1}
          className="@container mx-auto w-full max-w-4xl min-w-0 flex-1 px-4 pt-6 pb-[calc(var(--spacing-nav)+env(safe-area-inset-bottom)+2rem)] focus:outline-none shell-roomy:px-6 shell-wide:px-8 shell-wide:pt-10 shell-wide:pb-16"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
