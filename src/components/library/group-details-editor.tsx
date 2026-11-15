'use client';

import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { GroupKind } from '@/lib/library/rules';
import type { Group } from '@/lib/library/types';
import { NamedItemForm } from './named-item-form';

export function GroupDetailsEditor({
  kind,
  noun,
  group,
}: {
  kind: GroupKind;
  noun: string;
  group: Group;
}) {
  const [isEditing, setIsEditing] = useState(false);
  if (!isEditing) {
    return (
      <Button variant="secondary" onClick={() => setIsEditing(true)}>
        <Pencil aria-hidden="true" className="size-4" />
        Rename or describe
      </Button>
    );
  }
  return (
    <div className="w-full rounded-xl border border-line bg-surface p-4">
      <NamedItemForm
        noun={noun}
        path={`/api/library/${kind}/${group.id}`}
        item={group}
        onDone={() => setIsEditing(false)}
      />
    </div>
  );
}
