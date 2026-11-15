'use client';

import { Pencil } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { Book, WishlistItem } from '@/lib/library/types';
import { ActionError } from './action-error';
import { BookPicker } from './book-picker';
import { useBffAction } from './use-bff-action';
import { WishForm } from './wish-form';

export function WishEditor({ wish }: { wish: WishlistItem }) {
  const [isEditing, setIsEditing] = useState(false);
  if (!isEditing) {
    return (
      <Button variant="secondary" onClick={() => setIsEditing(true)}>
        <Pencil aria-hidden="true" className="size-4" />
        Edit wish
      </Button>
    );
  }
  return (
    <div className="w-full rounded-xl border border-line bg-surface p-4 sm:p-6">
      <h2 className="mb-4 font-serif text-xl font-semibold">Edit wish</h2>
      <WishForm wish={wish} onDone={() => setIsEditing(false)} />
    </div>
  );
}

/**
 * Records that a wish was fulfilled by a book already in the catalogue. The API never creates a
 * book or copy from a wish, and there is no way to undo an acquisition, so the reader confirms.
 */
export function AcquireWish({ wish }: { wish: WishlistItem }) {
  const router = useRouter();
  const [chosen, setChosen] = useState<Book | null>(null);
  const { send, isPending, error, setError } = useBffAction();

  async function confirm() {
    if (!chosen) return;
    const result = await send('PUT', `/api/library/wishlist/${wish.id}/acquisition`, {
      bookId: chosen.id,
    });
    if (!result?.ok) return;
    setChosen(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-muted">
        Got it? First add the book to your library, then choose it here to mark this wish acquired.
      </p>
      <BookPicker
        label="Find the book in your library"
        chooseLabel="Choose"
        onChoose={(book) => {
          setError(null);
          setChosen(book);
        }}
      />
      <ConfirmDialog
        open={chosen !== null}
        title="Mark this wish as acquired?"
        tone="primary"
        confirmLabel="Mark acquired"
        pendingLabel="Saving…"
        isPending={isPending}
        onConfirm={confirm}
        onCancel={() => setChosen(null)}
        error={<ActionError error={error} />}
      >
        <p>
          “{wish.title}” will be linked to “{chosen?.title}” in your library. This can’t be undone,
          though you can still edit the wish’s details. No book or copy is created.
        </p>
      </ConfirmDialog>
    </div>
  );
}
