'use client';

import { ChevronDown, LogOut } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { SESSION_API, type BackendSignOut, type SignedInProfile } from '@/lib/auth/session-api';
import { postToSessionApi } from '@/lib/auth/session-client';
import { replaceWith } from '@/lib/navigation/hard-navigation';
import { cn } from '@/lib/utils';

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/);
  const initials =
    words.length > 1 ? `${words[0]?.[0] ?? ''}${words.at(-1)?.[0] ?? ''}` : name.slice(0, 2);
  return initials.toUpperCase();
}

/**
 * A disclosure (button + panel) rather than an ARIA menu: it holds one action and some text, so
 * the simpler pattern reads more naturally with a screen reader. Escape or a click outside closes
 * it and returns focus to the button.
 */
export function AccountMenu({ name, email }: SignedInProfile) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const panelId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setIsOpen(false);
      buttonRef.current?.focus();
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);

  async function signOut() {
    if (isSigningOut) return;
    setIsSigningOut(true);
    setProblem(null);
    const result = await postToSessionApi<{ backendSignOut: BackendSignOut }>(
      SESSION_API.logout,
      {},
    );
    if (result.ok) {
      const confirmed = result.data.backendSignOut !== 'unconfirmed';
      replaceWith(confirmed ? '/login?signedOut=1' : '/login?signedOut=unconfirmed');
      return;
    }
    if (result.status === 503) {
      // The server answered and removed the cookie, but could not confirm the end of the session.
      replaceWith('/login?signedOut=unconfirmed');
      return;
    }
    setIsSigningOut(false);
    setProblem('You are still signed in: Avuneri could not be reached. Try again.');
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen((open) => !open)}
        className="flex min-h-11 items-center gap-2 rounded-full py-1 pr-2 pl-1 text-sm font-medium text-ink hover:bg-surface-muted motion-safe:transition-colors"
      >
        <span
          aria-hidden="true"
          className="grid size-8 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent-ink"
        >
          {initialsOf(name)}
        </span>
        <span className="sr-only">Account:</span>{' '}
        <span className="sr-only max-w-40 truncate sm:not-sr-only">{name}</span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            'size-4 text-ink-muted motion-safe:transition-transform',
            isOpen && 'rotate-180',
          )}
        />
      </button>

      <div
        id={panelId}
        hidden={!isOpen}
        className="absolute top-full right-0 z-40 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-surface p-4 shadow-lg"
      >
        <p className="truncate font-medium text-ink">{name}</p>
        <p className="text-sm break-all text-ink-muted">{email}</p>
        <div className="my-3 border-t border-line" />
        {problem ? (
          <p role="alert" className="mb-3 text-sm text-danger">
            {problem}
          </p>
        ) : null}
        <Button
          variant="secondary"
          className="w-full"
          aria-disabled={isSigningOut}
          onClick={signOut}
        >
          <LogOut aria-hidden="true" className="size-4" />
          {isSigningOut ? 'Logging out…' : 'Log out'}
        </Button>
      </div>
    </div>
  );
}
