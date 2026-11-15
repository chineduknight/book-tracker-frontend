import { cn } from '@/lib/utils';

/** The Avuneri mark: an open book on a deep green tile. Decorative; the name is always beside it. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      className={cn('size-7', className)}
    >
      <rect width="32" height="32" rx="8" className="fill-accent" />
      <path
        d="M6.5 10.2c3-1.1 6.3-.9 9.5 1 3.2-1.9 6.5-2.1 9.5-1v12.3c-3-1.1-6.3-.9-9.5 1-3.2-1.9-6.5-2.1-9.5-1Z"
        fill="none"
        strokeWidth="1.8"
        strokeLinejoin="round"
        className="stroke-on-accent"
      />
      <path d="M16 11.3v12" strokeWidth="1.8" strokeLinecap="round" className="stroke-on-accent" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <BrandMark />
      <span className="font-serif text-xl font-semibold tracking-tight text-ink">Avuneri</span>
    </span>
  );
}
