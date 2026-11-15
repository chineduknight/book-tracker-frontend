import Link from 'next/link';
import type { ReactNode } from 'react';
import { Wordmark } from '@/components/brand/wordmark';

/** The frame for pages outside the signed-in shell: sign-in, registration, errors and 404. */
export function PublicFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-md items-center px-4 sm:max-w-lg">
          <Link href="/" className="flex min-h-11 items-center rounded-md">
            <Wordmark />
          </Link>
        </div>
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-md flex-1 px-4 pt-8 pb-12 focus:outline-none sm:max-w-lg sm:pt-14"
      >
        {children}
      </main>
    </div>
  );
}
