import { describe, expect, it } from 'vitest';
import { parseReadingHistoryQuery, readingHistoryHref } from '@/lib/reading/queries';
import { isFilteredNotesQuery, notesHref, parseNotesQuery } from './queries';

const BOOK = '665F1C2AB4E5D1A2B3C4D5E6';

describe('parseNotesQuery', () => {
  it('reads only supported values and round-trips them', () => {
    const query = parseNotesQuery({
      kind: 'highlight',
      q: '  ardent   soul ',
      chapter: ' Chapter 3 ',
      bookId: BOOK,
      sort: 'oldest',
      page: '2',
    });
    expect(query).toEqual({
      kind: 'highlight',
      q: 'ardent soul',
      chapter: 'Chapter 3',
      bookId: BOOK.toLowerCase(),
      readingSessionId: undefined,
      sort: 'oldest',
      page: 2,
      invalidFilter: false,
    });
    expect(
      parseNotesQuery(Object.fromEntries(new URL(`http://x${notesHref(query)}`).searchParams)),
    ).toEqual(query);
  });

  it('falls back to defaults for repeated or unknown values', () => {
    const query = parseNotesQuery({
      kind: ['note', 'highlight'],
      sort: 'relevance',
      page: '0',
      q: '---',
    });
    expect(query).toMatchObject({ kind: undefined, sort: 'recent', page: 1, q: undefined });
    expect(isFilteredNotesQuery(query)).toBe(false);
  });

  it('reports a malformed book or reading id instead of silently showing every note', () => {
    expect(parseNotesQuery({ bookId: 'not-an-id' }).invalidFilter).toBe(true);
    expect(parseNotesQuery({ readingSessionId: [BOOK, BOOK] }).invalidFilter).toBe(true);
  });

  it('builds short canonical links: a filter change starts at page 1', () => {
    expect(notesHref({ kind: 'note', sort: 'recent', page: 1 })).toBe('/notes?kind=note');
    expect(notesHref({ q: 'a b' })).toBe('/notes?q=a+b');
  });
});

describe('parseReadingHistoryQuery', () => {
  it('supports status and order (there is no text search for readings)', () => {
    const query = parseReadingHistoryQuery({
      status: 'completed',
      sort: 'oldest',
      page: '3',
      q: 'x',
    });
    expect(query).toEqual({ status: 'completed', sort: 'oldest', page: 3 });
    expect(readingHistoryHref(query)).toBe('/reading?status=completed&sort=oldest&page=3');
    expect(parseReadingHistoryQuery({ status: 'paused' }).status).toBeUndefined();
  });
});
