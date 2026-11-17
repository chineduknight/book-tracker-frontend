'use client';

import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { readFormValues } from '@/lib/forms/read-form-values';

type Values<T> = { [Key in keyof T]: string };

function differs<T extends Values<T>>(current: T, initial: T): boolean {
  return (Object.keys(initial) as Array<keyof T>).some((key) => current[key] !== initial[key]);
}

/** A same-tab, same-origin navigation to another page, i.e. one that would discard the form. */
function leavingHref(event: MouseEvent): string | null {
  if (event.defaultPrevented || event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const anchor = (event.target as Element | null)?.closest?.('a[href]');
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  if (anchor.target && anchor.target !== '_self') return null;
  if (anchor.hasAttribute('download')) return null;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  if (url.pathname === window.location.pathname && url.search === window.location.search) {
    return null;
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Where the reader was going when the guard stopped them. */
type Pending = { kind: 'link'; href: string } | { kind: 'traverse'; key: string };

/**
 * A browser Back or Forward to another page of this app, i.e. one that would discard the form.
 * Only traversals the browser lets the page cancel are considered: same-document ones (the app's
 * own history entries) after the reader has interacted with the page. Others go ahead as usual;
 * leaving the document still triggers the browser's own unload prompt.
 */
function leavingTraversal(event: NavigateEvent): string | null {
  if (event.navigationType !== 'traverse' || !event.cancelable) return null;
  if (!event.destination.sameDocument) return null;
  const url = new URL(event.destination.url);
  if (url.origin !== window.location.origin) return null;
  // Moving between entries of this same page (an in-page #anchor) loses nothing.
  if (url.pathname === window.location.pathname && url.search === window.location.search) {
    return null;
  }
  return event.destination.key;
}

/**
 * Whether Back and Forward can be guarded safely. Verified in Chromium and Firefox: the reader is
 * asked every time and can always leave. In WebKit (Safari, and every browser on iOS, which all
 * use it) the first Back is cancelled correctly, but afterwards Back does nothing at all, which
 * would trap the reader; so WebKit is excluded and keeps the browser's plain behaviour. Detected by
 * `navigator.vendor`, which every WebKit browser reports as Apple's.
 */
function traversalsCanBeGuarded(): boolean {
  return typeof window.navigation !== 'undefined' && navigator.vendor !== 'Apple Computer, Inc.';
}

/**
 * Warns before unsaved form text is abandoned: in-app links (including the navigation bar and
 * Cancel) and the browser's Back and Forward within the app ask first in an accessible dialog, and
 * reloading or closing the tab triggers the browser's own prompt. Dirtiness is read from the fields
 * themselves, so text typed before the page became interactive counts too. There is no autosave:
 * nothing is stored until the reader saves.
 *
 * Back and Forward use the Navigation API's cancelable traversals: no history entries are added
 * and nothing is rewritten (browsers allow a page to cancel a traversal only after a user
 * interaction, and "Discard changes" completes it). Where the API is missing, or in WebKit (see
 * {@link traversalsCanBeGuarded}), Back and Forward behave as before and the form is discarded
 * (docs/launch-readiness.md, D1).
 */
export function useUnsavedChanges<FormValues extends Values<FormValues>>(
  formRef: RefObject<HTMLFormElement | null>,
  initialValues: FormValues,
  what = 'your changes',
) {
  const router = useRouter();
  const [initial] = useState(initialValues);
  const [isDirty, setIsDirty] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const released = useRef(false);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const check = () => setIsDirty(differs(readFormValues(form, initial), initial));
    check();
    form.addEventListener('input', check);
    form.addEventListener('change', check);
    return () => {
      form.removeEventListener('input', check);
      form.removeEventListener('change', check);
    };
  }, [formRef, initial]);

  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (released.current) return;
      event.preventDefault();
    };
    const onClick = (event: MouseEvent) => {
      if (released.current) return;
      const href = leavingHref(event);
      if (!href) return;
      event.preventDefault();
      event.stopPropagation();
      setPending({ kind: 'link', href });
    };
    const onNavigate = (event: NavigateEvent) => {
      if (released.current) return;
      const key = leavingTraversal(event);
      if (key === null) return;
      event.preventDefault();
      setPending({ kind: 'traverse', key });
    };
    const history = traversalsCanBeGuarded() ? window.navigation : null;
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    history?.addEventListener('navigate', onNavigate);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
      history?.removeEventListener('navigate', onNavigate);
    };
  }, [isDirty]);

  /** Call once the work is saved, just before navigating away. */
  function release() {
    released.current = true;
  }

  const dialog = (
    <ConfirmDialog
      open={pending !== null}
      title="Discard unsaved changes?"
      confirmLabel="Discard changes"
      cancelLabel="Keep editing"
      pendingLabel="Leaving…"
      isPending={false}
      onCancel={() => setPending(null)}
      onConfirm={() => {
        const destination = pending;
        released.current = true;
        setPending(null);
        if (destination?.kind === 'link') router.push(destination.href as Route);
        // Completes the Back or Forward the reader asked for; the app's router follows it.
        if (destination?.kind === 'traverse') {
          const traversal = window.navigation?.traverseTo(destination.key);
          // A traversal superseded by another navigation rejects; there is nothing to report.
          traversal?.committed?.catch(() => undefined);
          traversal?.finished?.catch(() => undefined);
        }
      }}
    >
      <p>
        You haven’t saved {what}. If you leave this page now, they will be lost. Avuneri doesn’t
        save drafts.
      </p>
    </ConfirmDialog>
  );

  return { isDirty, release, dialog };
}
