import 'server-only';
import type { ApiClient } from '@/lib/api/client';
import type { Page } from '@/lib/api/contract';
import { PAGE_SIZE } from '@/lib/library/rules';
import type { Book } from '@/lib/library/types';
import type { ReadingHistoryQuery } from '@/lib/reading/queries';
import type { ReadingSession } from '@/lib/reading/types';
import { lookUpBooks, mapBounded, orNullIfMissing } from './book-lookup';
import { getReadingOverview, listReadingHistory } from './reading-api';

export interface HistoryRow {
  session: ReadingSession;
  /** null when the book was deleted after the history was read. */
  book: Book | null;
  /** True for an in-progress read of a book that was finished before. */
  isReread: boolean;
}

export interface ReadingHistoryPage {
  rows: HistoryRow[];
  pagination: Page<ReadingSession>['pagination'];
  /** Totals straight from the API (each list's pagination total), never counted from one page. */
  totals: { inProgress: number; completed: number };
}

/**
 * One page of the reader's history with each row's book. Fan-out is bounded: at most one book
 * request per distinct book on the page, and one overview per in-progress row (a book has at most
 * one), to tell a reread from a first read.
 */
export async function loadReadingHistory(
  api: ApiClient,
  query: ReadingHistoryQuery,
): Promise<ReadingHistoryPage> {
  const [page, inProgress, completed] = await Promise.all([
    listReadingHistory(api, {
      page: query.page,
      limit: PAGE_SIZE,
      status: query.status,
      sort: query.sort,
    }),
    listReadingHistory(api, { page: 1, limit: 1, status: 'in_progress' }),
    listReadingHistory(api, { page: 1, limit: 1, status: 'completed' }),
  ]);
  const books = await lookUpBooks(
    api,
    page.items.map((session) => session.bookId),
  );
  const activeBookIds = [
    ...new Set(
      page.items
        .filter((session) => session.status === 'in_progress' && books.get(session.bookId))
        .map((session) => session.bookId),
    ),
  ];
  const overviews = await mapBounded(activeBookIds, (bookId) =>
    orNullIfMissing(getReadingOverview(api, bookId)),
  );
  const rereads = new Set(
    activeBookIds.filter((_bookId, index) => (overviews[index]?.completedSessions ?? 0) > 0),
  );

  return {
    rows: page.items.map((session) => ({
      session,
      book: books.get(session.bookId) ?? null,
      isReread: session.status === 'in_progress' && rereads.has(session.bookId),
    })),
    pagination: page.pagination,
    totals: { inProgress: inProgress.pagination.total, completed: completed.pagination.total },
  };
}
