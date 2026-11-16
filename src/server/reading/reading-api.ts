import 'server-only';
import type { z } from 'zod';
import type { ApiClient } from '@/lib/api/client';
import type { Page } from '@/lib/api/contract';
import { apiPath } from '@/lib/api/path';
import type { ReadingSort, ReadingStatus } from '@/lib/reading/rules';
import type { ReadingOverview, ReadingSession } from '@/lib/reading/types';
import {
  overviewSchema,
  sessionSchema,
  type StartSession,
  type UpdateSession,
} from './reading-schemas';

/** One function per reading endpoint; each validates the API's response. There is no DELETE. */
const parseWith =
  <T>(schema: z.ZodType<T>) =>
  (data: unknown): T =>
    schema.parse(data);

export interface SessionListQuery {
  page: number;
  limit: number;
  status?: ReadingStatus | undefined;
  sort?: ReadingSort | undefined;
}

export function listReadingHistory(
  api: ApiClient,
  query: SessionListQuery,
): Promise<Page<ReadingSession>> {
  return api.getPage(apiPath`/reading-sessions`, {
    query: { page: query.page, limit: query.limit, status: query.status, sort: query.sort },
    parse: parseWith(sessionSchema),
  });
}

export function listBookSessions(
  api: ApiClient,
  bookId: string,
  query: SessionListQuery,
): Promise<Page<ReadingSession>> {
  return api.getPage(apiPath`/books/${bookId}/reading-sessions`, {
    query: { page: query.page, limit: query.limit, status: query.status, sort: query.sort },
    parse: parseWith(sessionSchema),
  });
}

export function getReadingOverview(api: ApiClient, bookId: string): Promise<ReadingOverview> {
  return api.get(apiPath`/books/${bookId}/reading-overview`, { parse: parseWith(overviewSchema) });
}

export function getSession(api: ApiClient, sessionId: string): Promise<ReadingSession> {
  return api.get(apiPath`/reading-sessions/${sessionId}`, { parse: parseWith(sessionSchema) });
}

export function startSession(
  api: ApiClient,
  bookId: string,
  session: StartSession,
): Promise<ReadingSession> {
  return api.post(apiPath`/books/${bookId}/reading-sessions`, {
    body: session,
    parse: parseWith(sessionSchema),
  });
}

export function updateSession(
  api: ApiClient,
  sessionId: string,
  changes: UpdateSession,
): Promise<ReadingSession> {
  return api.patch(apiPath`/reading-sessions/${sessionId}`, {
    body: changes,
    parse: parseWith(sessionSchema),
  });
}
