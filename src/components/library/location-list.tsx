'use client';

import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { StorageLocation } from '@/lib/library/types';
import { NamedItemForm } from './named-item-form';

/** Locations can be renamed and described. The API has no way to delete one, so neither does this. */
export function LocationList({ locations }: { locations: StorageLocation[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  return (
    <ul className="flex flex-col gap-3">
      {locations.map((location) => (
        <li key={location.id} className="rounded-xl border border-line bg-surface p-4">
          {editingId === location.id ? (
            <NamedItemForm
              noun="location"
              path={`/api/library/locations/${location.id}`}
              item={location}
              onDone={() => setEditingId(null)}
            />
          ) : (
            <div className="flex flex-col gap-3 @md:flex-row @md:items-start @md:justify-between">
              <div className="min-w-0">
                <p className="font-medium break-words text-ink">{location.name}</p>
                {location.description ? (
                  <p className="mt-1 text-sm break-words whitespace-pre-line text-ink-muted">
                    {location.description}
                  </p>
                ) : null}
              </div>
              <Button variant="secondary" onClick={() => setEditingId(location.id)}>
                <Pencil aria-hidden="true" className="size-4" />
                Edit<span className="sr-only"> {location.name}</span>
              </Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
