import Link from 'next/link';
import type { Route } from 'next';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { FORMAT_LABELS } from '@/lib/library/rules';
import type { Book } from '@/lib/library/types';
import { BookCover } from './book-cover';

export function authorLine(authors: readonly string[]): string {
  return authors.length > 0 ? authors.join(', ') : 'Unknown author';
}

/** A compact catalogue entry: shows only fields the API actually returns. */
export function BookSummary({ book, actions }: { book: Book; actions?: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-line bg-surface p-4">
      <BookCover src={book.coverUrl} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link
          href={`/library/books/${book.id}` as Route}
          className="font-serif text-lg leading-snug font-semibold break-words text-ink hover:text-accent"
        >
          {book.title}
        </Link>
        <p className="text-sm break-words text-ink-muted">{authorLine(book.authors)}</p>
        <div className="mt-1 flex flex-wrap gap-2">
          <Badge>{FORMAT_LABELS[book.format]}</Badge>
          {book.publicationYear ? <Badge>{book.publicationYear}</Badge> : null}
        </div>
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}
