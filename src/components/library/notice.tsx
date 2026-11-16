import { CircleCheck } from 'lucide-react';

/** Confirmation messages a page may show after a redirect. Only these keys are ever rendered. */
const NOTICES = {
  'book-created': 'Book added to your library.',
  'book-saved': 'Changes saved.',
  'book-deleted': 'Book deleted. It no longer appears in your library, groups or searches.',
  'group-deleted': 'Deleted. Its books are still in your library.',
  'wish-created': 'Added to your wishlist.',
  'wish-deleted': 'Wish deleted.',
  'reading-started': 'Reading started. Record your progress whenever you like.',
  'reading-recorded': 'Finished read recorded.',
  'reading-saved': 'Changes saved.',
  'reading-finished': 'Reading marked as finished. It stays in your history.',
  'note-created': 'Saved.',
  'note-saved': 'Changes saved.',
  'note-deleted': 'Deleted. It no longer appears in your notes or searches.',
} as const;

export type NoticeKey = keyof typeof NOTICES;

export function Notice({ notice }: { notice: string | string[] | undefined }) {
  const message =
    typeof notice === 'string' && notice in NOTICES ? NOTICES[notice as NoticeKey] : undefined;
  if (!message) return null;
  return (
    <p
      role="status"
      className="mb-6 flex items-start gap-2 rounded-xl border border-line bg-accent-soft p-4 text-sm text-accent-ink"
    >
      <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      {message}
    </p>
  );
}
