import { ExternalLink as ExternalIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { isHttpUrl } from '@/lib/library/rules';

/**
 * A link to a reader-supplied address. Only absolute http(s) URLs become links; it opens a new tab
 * without referrer or opener, and the app never fetches the address itself.
 */
export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  if (!isHttpUrl(href)) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="inline-flex items-center gap-1 font-medium break-all text-accent underline underline-offset-4 hover:text-accent-hover"
    >
      {children}
      <ExternalIcon aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}
