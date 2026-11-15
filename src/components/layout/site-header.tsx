import Link from 'next/link';
import { BookMarked } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

/**
 * The top bar. The right-hand slot is reserved for account settings, which arrive with sign-in
 * (FE #16). Until then it holds a non-interactive status label, so there is no dead control.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas">
      <div className="flex h-14 items-center justify-between gap-3 px-4 md:px-6">
        <Link
          href="/"
          className="flex min-h-11 min-w-0 items-center gap-2 rounded-md font-serif text-lg font-semibold text-ink"
        >
          <BookMarked aria-hidden="true" className="size-5 shrink-0 text-accent" />
          <span className="truncate">Book Tracker</span>
        </Link>
        <div data-slot="account" className="flex shrink-0 items-center">
          <Badge>Preview</Badge>
        </div>
      </div>
    </header>
  );
}
