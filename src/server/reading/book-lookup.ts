import 'server-only';
import type { ApiClient } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import type { Book } from '@/lib/library/types';
import { getBook } from '../library/library-api';

/** At most this many book requests run at once for one page of rows. */
const CONCURRENCY = 4;
/** A page of history or notes has at most 100 rows; never fan out further than that. */
const MAX_LOOKUPS = 100;

/**
 * Runs `load` for each item with bounded concurrency. Rejections propagate, so an outage fails the
 * whole page (shown as "unavailable") instead of producing a half-empty list.
 */
export async function mapBounded<Item, Result>(
  items: readonly Item[],
  load: (item: Item) => Promise<Result>,
  concurrency = CONCURRENCY,
): Promise<Result[]> {
  const results = new Array<Result>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await load(items[index] as Item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

/**
 * The books behind a page of reading sessions or notes, each fetched once. A book that is gone by
 * now (404: deleted between the two requests) maps to null and is labelled as such; any other
 * failure rejects.
 */
export async function lookUpBooks(
  api: ApiClient,
  bookIds: readonly string[],
): Promise<Map<string, Book | null>> {
  const unique = [...new Set(bookIds)].slice(0, MAX_LOOKUPS);
  const books = await mapBounded(unique, (bookId) => orNullIfMissing(getBook(api, bookId)));
  return new Map(unique.map((bookId, index) => [bookId, books[index] ?? null]));
}

/** null when the API says the record does not exist (for this reader); other errors propagate. */
export async function orNullIfMissing<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}
