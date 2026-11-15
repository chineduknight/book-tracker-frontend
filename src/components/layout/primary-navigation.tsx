'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isDestinationActive, primaryNavigation } from '@/config/navigation';
import { cn } from '@/lib/utils';

/**
 * One `<nav>` that is a fixed bottom bar on phones and a persistent sidebar from 768px. Rendering a
 * single list (rather than a bar and a sidebar toggled by CSS) keeps exactly one set of links and
 * exactly one `aria-current="page"` in the document at every size.
 *
 * Active state is shown three ways: the icon sits in a tinted pill, the label turns bold and accent
 * coloured, and `aria-current` tells assistive technology.
 */
export function PrimaryNavigation() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className={cn(
        'fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]',
        'md:sticky md:top-14 md:z-auto md:h-[calc(100dvh-3.5rem)] md:w-56 md:shrink-0 md:overflow-y-auto',
        'md:border-t-0 md:border-r md:bg-canvas md:pb-0 lg:w-64',
      )}
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5 md:mx-0 md:flex md:max-w-none md:flex-col md:gap-1 md:p-3">
        {primaryNavigation.map(({ href, label, icon: Icon }) => {
          const active = isDestinationActive(href, pathname);
          return (
            <li key={href} className="min-w-0">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group flex min-h-nav flex-col items-center justify-center gap-1 px-0.5 py-2 text-center',
                  'text-[0.6875rem] leading-tight font-medium break-words',
                  'md:min-h-11 md:flex-row md:justify-start md:gap-3 md:rounded-lg md:px-3 md:py-2 md:text-left md:text-sm',
                  'motion-safe:transition-colors',
                  active
                    ? 'font-semibold text-accent-ink md:bg-accent-soft'
                    : 'text-ink-muted hover:text-ink md:hover:bg-surface-muted',
                )}
              >
                <span
                  className={cn(
                    'grid h-7 w-12 place-items-center rounded-full md:h-auto md:w-auto',
                    active
                      ? 'bg-accent-soft md:bg-transparent'
                      : 'group-hover:bg-surface-muted md:group-hover:bg-transparent',
                  )}
                >
                  <Icon aria-hidden="true" className="size-5" strokeWidth={active ? 2.25 : 1.75} />
                </span>
                <span className="max-w-full">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
