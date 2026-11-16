import { hrefWithQuery, parsePage, type SearchParams } from '@/lib/library/queries';
import { READING_SORTS, READING_STATUSES, type ReadingSort, type ReadingStatus } from './rules';

/** Reading history filters in the URL. The API offers status and order, and no text search. */
export interface ReadingHistoryQuery {
  status?: ReadingStatus | undefined;
  sort: ReadingSort;
  page: number;
}

export const READING_QUERY_DEFAULTS = { sort: 'recent', page: 1 } as const;

function single(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  return typeof value === 'string' ? value : undefined;
}

export function parseReadingHistoryQuery(params: SearchParams): ReadingHistoryQuery {
  const status = single(params, 'status');
  const sort = single(params, 'sort');
  return {
    status: READING_STATUSES.find((candidate) => candidate === status),
    sort: READING_SORTS.find((candidate) => candidate === sort) ?? 'recent',
    page: parsePage(params),
  };
}

export function readingHistoryHref(query: ReadingHistoryQuery, page = query.page): string {
  return hrefWithQuery(
    '/reading',
    { status: query.status, sort: query.sort, page },
    READING_QUERY_DEFAULTS,
  );
}
