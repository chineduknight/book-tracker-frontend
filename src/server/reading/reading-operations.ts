import 'server-only';
import type { BffFieldError } from '@/lib/bff/errors';
import { PAGE_SIZE } from '@/lib/library/rules';
import type { LibraryOperation, QueryResult } from '../http/library-route';
import * as reading from './reading-api';
import { startSessionSchema, updateSessionSchema } from './reading-schemas';

/*
 * Every browser-facing reading operation, one per API endpoint. Route files under
 * src/app/api/reading bind them to methods. A session belongs to a catalogue book (never a copy).
 */
function operation<Input, Result, IdName extends string = never>(
  definition: LibraryOperation<Input, Result, IdName>,
) {
  return definition;
}

/** `?page=N` only: the session picker on the note form pages through one book's readings. */
export function sessionPageQuery(params: URLSearchParams): QueryResult<{ page: number }> {
  const problems: BffFieldError[] = [];
  let page = 1;
  for (const key of new Set(params.keys())) {
    const all = params.getAll(key);
    if (key !== 'page') problems.push({ field: key, message: 'is not a supported parameter' });
    else if (all.length > 1) problems.push({ field: key, message: 'must be given only once' });
    else if (/^[1-9][0-9]{0,5}$/.test(all[0] ?? '')) page = Number(all[0]);
    else problems.push({ field: key, message: 'must be a positive whole number' });
  }
  return problems.length > 0
    ? {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'The request could not be understood.',
          fields: problems,
        },
      }
    : { ok: true, value: { page } };
}

export const startSession = operation({
  ids: ['bookId'],
  body: startSessionSchema,
  successStatus: 201,
  run: (api, { ids, input }) => reading.startSession(api, ids.bookId, input),
});

export const listBookSessions = operation({
  ids: ['bookId'],
  query: sessionPageQuery,
  run: (api, { ids, input }) =>
    reading.listBookSessions(api, ids.bookId, { page: input.page, limit: PAGE_SIZE }),
});

export const getReadingOverview = operation({
  ids: ['bookId'],
  query: (params) =>
    params.size === 0
      ? { ok: true, value: undefined }
      : {
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'This request takes no parameters.' },
        },
  run: (api, { ids }) => reading.getReadingOverview(api, ids.bookId),
});

export const updateSession = operation({
  ids: ['sessionId'],
  body: updateSessionSchema,
  run: (api, { ids, input }) => reading.updateSession(api, ids.sessionId, input),
});
