'use client';

import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { BookPicker } from '@/components/library/book-picker';

/** Step one of lending: find the book, then choose one of its physical copies. */
export function LendBookPicker() {
  const router = useRouter();
  return (
    <BookPicker
      label="Which book are you lending?"
      chooseLabel="Choose"
      onChoose={(book) => router.push(`/lending/new?bookId=${book.id}` as Route)}
    />
  );
}
