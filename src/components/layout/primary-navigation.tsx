'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isDestinationActive, primaryNavigation } from '@/config/navigation';
import { cn } from '@/lib/utils';

/**
 * One `<nav>` that is a fixed bottom bar on phones and a persistent sidebar when the shell is at least 48rem wide (768px at 100% text). Rendering a
 * single list (rather than a bar and a sidebar toggled by CSS) keeps exactly one set of links and
 * exactly one `aria-current="page"` in the document at every size.
 *
 * Active state is shown three ways: the icon sits in a tinted pill, the label turns bold and accent
 * coloured, and `aria-current` tells assistive technology.
 *
 * The bar is a size container. When five columns cannot hold whole labels (enlarged text, which
 * scales every `rem`, on a narrow phone), it becomes two rows of three and two, in the same order,
 * without the decorative icons; the current tab itself is then tinted. Labels never break
 * mid-word at 200% text, and the two rows fit the bottom padding `main` reserves for the bar.
 */
export function PrimaryNavigation() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className={cn(
        '@container/nav fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]',
        'shell-wide:sticky shell-wide:top-14 shell-wide:z-auto shell-wide:h-[calc(100dvh-3.5rem)] shell-wide:w-56 shell-wide:shrink-0 shell-wide:overflow-y-auto',
        'shell-wide:border-t-0 shell-wide:border-r shell-wide:bg-canvas shell-wide:pb-0 shell-wider:w-64',
      )}
    >
      <ul
        className={cn(
          'mx-auto grid max-w-lg grid-cols-5 shell-wide:mx-0 shell-wide:flex shell-wide:max-w-none shell-wide:flex-col shell-wide:gap-1 shell-wide:p-3',
          'shell-narrow:@max-[17rem]/nav:flex shell-narrow:@max-[17rem]/nav:flex-wrap shell-narrow:@max-[17rem]/nav:justify-center',
        )}
      >
        {primaryNavigation.map(({ href, label, icon: Icon }) => {
          const active = isDestinationActive(href, pathname);
          return (
            <li key={href} className="min-w-0 shell-narrow:@max-[17rem]/nav:basis-1/3">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group flex min-h-nav flex-col items-center justify-center gap-1 px-0.5 py-2 text-center',
                  'text-[0.6875rem] leading-tight font-medium break-words',
                  'shell-narrow:@max-[17rem]/nav:min-h-11 shell-narrow:@max-[17rem]/nav:rounded-lg shell-narrow:@max-[17rem]/nav:px-0 shell-narrow:@max-[17rem]/nav:py-1',
                  'shell-wide:min-h-11 shell-wide:flex-row shell-wide:justify-start shell-wide:gap-3 shell-wide:rounded-lg shell-wide:px-3 shell-wide:py-2 shell-wide:text-left shell-wide:text-sm',
                  'motion-safe:transition-colors',
                  active
                    ? 'font-semibold text-accent-ink shell-narrow:@max-[17rem]/nav:bg-accent-soft shell-wide:bg-accent-soft'
                    : 'text-ink-muted hover:text-ink shell-wide:hover:bg-surface-muted',
                )}
              >
                <span
                  data-slot="nav-icon"
                  className={cn(
                    'grid h-7 w-12 place-items-center rounded-full shell-wide:h-auto shell-wide:w-auto',
                    'shell-narrow:@max-[17rem]/nav:hidden',
                    active
                      ? 'bg-accent-soft shell-wide:bg-transparent'
                      : 'group-hover:bg-surface-muted shell-wide:group-hover:bg-transparent',
                  )}
                >
                  <Icon aria-hidden="true" className="size-5" strokeWidth={active ? 2.25 : 1.75} />
                </span>
                <span data-slot="nav-label" className="max-w-full">
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
