import 'server-only';
import type { BffFieldError } from '@/lib/bff/errors';
import { parseSearchText, type BookListQuery } from '@/lib/library/queries';
import { BOOK_FORMATS, BOOK_SORTS } from '@/lib/library/rules';
import type { QueryResult } from '../http/library-route';
import { duplicateCheckSchema } from './library-schemas';

/**
 * Query allowlists for the BFF's read routes, matching the API: every key at most once, unknown
 * keys refused. The browser can never add parameters the API was not designed to receive.
 */
function readStrictly(
  params: URLSearchParams,
  allowed: readonly string[],
): { values: Record<string, string>; problems: BffFieldError[] } {
  const values: Record<string, string> = {};
  const problems: BffFieldError[] = [];
  for (const key of new Set(params.keys())) {
    const all = params.getAll(key);
    if (!allowed.includes(key))
      problems.push({ field: key, message: 'is not a supported parameter' });
    else if (all.length > 1) problems.push({ field: key, message: 'must be given only once' });
    else values[key] = all[0] ?? '';
  }
  return { values, problems };
}

function refused<T>(fields: BffFieldError[]): QueryResult<T> {
  return {
    ok: false,
    error: { code: 'VALIDATION_ERROR', message: 'The search could not be understood.', fields },
  };
}

export function bookSearchQuery(params: URLSearchParams): QueryResult<BookListQuery> {
  const { values, problems } = readStrictly(params, ['q', 'format', 'sort', 'page']);
  const query: BookListQuery = { sort: 'recent', page: 1 };

  if (values.q !== undefined) {
    query.q = parseSearchText(values.q);
    if (query.q === undefined) {
      problems.push({ field: 'q', message: 'must be 1–120 characters with a letter or digit' });
    }
  }
  if (values.format !== undefined) {
    const format = BOOK_FORMATS.find((candidate) => candidate === values.format);
    if (format) query.format = format;
    else problems.push({ field: 'format', message: 'must be physical or ebook' });
  }
  if (values.sort !== undefined) {
    const sort = BOOK_SORTS.find((candidate) => candidate === values.sort);
    if (sort) query.sort = sort;
    else problems.push({ field: 'sort', message: 'is not a supported order' });
  }
  if (values.page !== undefined) {
    if (/^[1-9][0-9]{0,5}$/.test(values.page)) query.page = Number(values.page);
    else problems.push({ field: 'page', message: 'must be a positive whole number' });
  }
  return problems.length > 0 ? refused(problems) : { ok: true, value: query };
}

export function duplicateCheckQuery(
  params: URLSearchParams,
): QueryResult<{ title?: string | undefined; isbn?: string | undefined }> {
  const { values, problems } = readStrictly(params, ['title', 'isbn']);
  if (problems.length > 0) return refused(problems);
  const parsed = duplicateCheckSchema.safeParse(values);
  if (parsed.success) return { ok: true, value: parsed.data };
  return refused(
    parsed.error.issues.map((issue) => ({
      field: typeof issue.path[0] === 'string' ? issue.path[0] : 'query',
      message: issue.message,
    })),
  );
}
