'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { Plus, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import type { GroupKind } from '@/lib/library/rules';
import type { Book, Group } from '@/lib/library/types';
import { ActionError } from './action-error';
import { BookPicker } from './book-picker';
import { useBffAction } from './use-bff-action';

const NOUN: Record<GroupKind, { one: string; many: string }> = {
  categories: { one: 'category', many: 'Categories' },
  collections: { one: 'collection', many: 'Collections' },
};

/** On a book's page: its categories or collections, with add and remove (idempotent, 204). */
export function BookGroupsEditor({
  kind,
  bookId,
  memberOf,
  allGroups,
}: {
  kind: GroupKind;
  bookId: string;
  memberOf: Group[];
  allGroups: Group[];
}) {
  const router = useRouter();
  const { send, isPending, error } = useBffAction();
  const [selected, setSelected] = useState('');
  const [status, setStatus] = useState('');
  const available = allGroups.filter((group) => !memberOf.some((member) => member.id === group.id));
  const noun = NOUN[kind];

  async function change(method: 'PUT' | 'DELETE', group: Group) {
    setStatus('');
    const result = await send(method, `/api/library/${kind}/${group.id}/books/${bookId}`);
    if (!result?.ok) return;
    setSelected('');
    setStatus(method === 'PUT' ? `Added to ${group.name}.` : `Removed from ${group.name}.`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <ActionError error={error} />
      {memberOf.length === 0 ? (
        <p className="text-sm text-ink-muted">Not in any {noun.one} yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {memberOf.map((group) => (
            <li
              key={group.id}
              className="flex items-center gap-1 rounded-full border border-line bg-surface-muted py-1 pr-1 pl-3 text-sm"
            >
              <Link
                href={`/library/${kind}/${group.id}` as Route}
                className="break-all text-ink hover:text-accent"
              >
                {group.name}
              </Link>
              <button
                type="button"
                aria-disabled={isPending}
                onClick={() => {
                  if (!isPending) void change('DELETE', group);
                }}
                className="grid size-9 place-items-center rounded-full text-ink-muted hover:bg-surface hover:text-danger"
              >
                <X aria-hidden="true" className="size-4" />
                <span className="sr-only">
                  Remove from {noun.one} {group.name}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {allGroups.length === 0 ? (
        <p className="text-sm text-ink-muted">
          You have no {noun.many.toLowerCase()} yet.{' '}
          <Link
            href={`/library/${kind}` as Route}
            className="text-accent underline underline-offset-4"
          >
            Create one
          </Link>
          .
        </p>
      ) : available.length > 0 ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="sm:w-64">
            <Select
              label={`Add to a ${noun.one}`}
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
            >
              <option value="">Choose a {noun.one}</option>
              {available.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </Select>
          </div>
          <Button
            variant="secondary"
            aria-disabled={isPending || selected === ''}
            onClick={() => {
              const group = available.find((candidate) => candidate.id === selected);
              if (group && !isPending) void change('PUT', group);
            }}
          >
            <Plus aria-hidden="true" className="size-4" />
            Add
          </Button>
        </div>
      ) : null}
      <p role="status" className="text-sm text-ink-muted">
        {status}
      </p>
    </div>
  );
}

/** On a group's page: add books by searching the catalogue. */
export function GroupBookAdder({
  kind,
  noun,
  groupId,
  memberIds,
}: {
  kind: GroupKind;
  noun: string;
  groupId: string;
  /** Every current member, from all pages. */
  memberIds: readonly string[];
}) {
  const router = useRouter();
  const { send, isPending, error } = useBffAction();
  const [status, setStatus] = useState('');

  async function add(book: Book) {
    setStatus('');
    const result = await send('PUT', `/api/library/${kind}/${groupId}/books/${book.id}`);
    if (!result?.ok) return;
    setStatus(`Added ${book.title}.`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <ActionError error={error} />
      <BookPicker
        label="Find a book to add"
        chooseLabel="Add"
        onChoose={add}
        excludeIds={memberIds}
        excludedReason={`already in this ${noun}`}
        isPending={isPending}
      />
      <p role="status" className="text-sm text-ink-muted">
        {status}
      </p>
    </div>
  );
}

/** Removes one book from a group; the book itself is untouched. */
export function RemoveFromGroupButton({
  kind,
  groupId,
  book,
}: {
  kind: GroupKind;
  groupId: string;
  book: Book;
}) {
  const router = useRouter();
  const { send, isPending, error } = useBffAction();
  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        variant="quiet"
        aria-disabled={isPending}
        onClick={async () => {
          if (isPending) return;
          const result = await send('DELETE', `/api/library/${kind}/${groupId}/books/${book.id}`);
          if (result?.ok) router.refresh();
        }}
      >
        <X aria-hidden="true" className="size-4" />
        Remove<span className="sr-only"> {book.title}</span>
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-danger">
          Couldn’t remove. Try again.
        </p>
      ) : null}
    </div>
  );
}
