import { BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A built-in placeholder. Reader-supplied cover URLs are never loaded as images: that would make
 * every viewer's browser contact an arbitrary host (and the CSP allows only this origin).
 */
export function BookCover({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid aspect-[2/3] w-12 shrink-0 place-items-center rounded-md border border-line bg-accent-soft text-accent-ink',
        className,
      )}
    >
      <BookOpen className="size-5" />
    </span>
  );
}
