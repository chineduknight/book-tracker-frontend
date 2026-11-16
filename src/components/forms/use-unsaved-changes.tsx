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

/**
 * Warns before unsaved form text is abandoned: in-app links (including the navigation bar and
 * Cancel) ask first in an accessible dialog, and reloading or closing the tab triggers the
 * browser's own prompt. Dirtiness is read from the fields themselves, so text typed before the page
 * became interactive counts too. There is no autosave: nothing is stored until the reader saves.
 * Browser back/forward within the app is not intercepted (documented limitation).
 */
export function useUnsavedChanges<FormValues extends Values<FormValues>>(
  formRef: RefObject<HTMLFormElement | null>,
  initialValues: FormValues,
  what = 'your changes',
) {
  const router = useRouter();
  const [initial] = useState(initialValues);
  const [isDirty, setIsDirty] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
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
      setPendingHref(href);
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [isDirty]);

  /** Call once the work is saved, just before navigating away. */
  function release() {
    released.current = true;
  }

  const dialog = (
    <ConfirmDialog
      open={pendingHref !== null}
      title="Discard unsaved changes?"
      confirmLabel="Discard changes"
      cancelLabel="Keep editing"
      pendingLabel="Leaving…"
      isPending={false}
      onCancel={() => setPendingHref(null)}
      onConfirm={() => {
        const href = pendingHref;
        released.current = true;
        setPendingHref(null);
        if (href) router.push(href as Route);
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
