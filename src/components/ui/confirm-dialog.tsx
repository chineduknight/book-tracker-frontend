'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from './button';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** Shown inside the dialog, e.g. a failed attempt. */
  error?: ReactNode;
  /** `danger` for deletions; `primary` for irreversible but non-destructive actions. */
  tone?: 'danger' | 'primary';
}

/**
 * A modal confirmation on the native `<dialog>`: the browser traps focus, makes the page behind
 * inert, closes on Escape and returns focus to the control that opened it.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  pendingLabel,
  isPending,
  onConfirm,
  onCancel,
  error,
  tone = 'danger',
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!isPending) onCancel();
      }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-0 text-ink shadow-lg backdrop:bg-black/40"
    >
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <h2 id={titleId} className="font-serif text-xl font-semibold break-words">
          {title}
        </h2>
        <div className="text-sm text-ink-muted">{children}</div>
        {error}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel} aria-disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (!isPending) onConfirm();
            }}
            aria-disabled={isPending}
            className={tone === 'danger' ? 'bg-danger text-surface hover:bg-danger' : undefined}
          >
            {isPending ? pendingLabel : confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
