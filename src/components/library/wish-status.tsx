import { Badge } from '@/components/ui/badge';
import { FORMAT_LABELS, PRIORITY_LABELS } from '@/lib/library/rules';
import type { WishlistItem } from '@/lib/library/types';

export function WishStatusBadges({ wish }: { wish: WishlistItem }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <Badge
        className={
          wish.status === 'acquired' ? 'border-accent bg-accent-soft text-accent-ink' : undefined
        }
      >
        {wish.status === 'acquired' ? 'Acquired' : 'Wanted'}
      </Badge>
      <Badge>{PRIORITY_LABELS[wish.priority]} priority</Badge>
      {wish.preferredFormat ? (
        <Badge>Prefers {FORMAT_LABELS[wish.preferredFormat].toLowerCase()}</Badge>
      ) : null}
    </div>
  );
}
