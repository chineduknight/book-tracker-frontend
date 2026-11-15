'use client';

import type { Route } from 'next';
import { Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ActionError } from './action-error';
import { useBffAction } from './use-bff-action';

interface DeleteButtonProps {
  /** The BFF path to DELETE, e.g. /api/library/books/<id>. */
  path: string;
  label: string;
  title: string;
  children: ReactNode;
  /** Where to go afterwards; without it the current page refreshes. */
  redirectTo?: string;
  variant?: 'secondary' | 'quiet';
}

/** Deletes after an explicit confirmation. Nothing changes on screen until the API agrees. */
export function DeleteButton({
  path,
  label,
  title,
  children,
  redirectTo,
  variant = 'secondary',
}: DeleteButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const { send, isPending, error, setError } = useBffAction();

  async function confirm() {
    const result = await send('DELETE', path);
    if (!result?.ok) return;
    setIsOpen(false);
    if (redirectTo) router.push(redirectTo as Route);
    router.refresh();
  }

  return (
    <>
      <Button
        variant={variant}
        onClick={() => {
          setError(null);
          setIsOpen(true);
        }}
      >
        <Trash2 aria-hidden="true" className="size-4" />
        {label}
      </Button>
      <ConfirmDialog
        open={isOpen}
        title={title}
        confirmLabel={label}
        pendingLabel="Deleting…"
        isPending={isPending}
        onConfirm={confirm}
        onCancel={() => setIsOpen(false)}
        error={<ActionError error={error} />}
      >
        {children}
      </ConfirmDialog>
    </>
  );
}
