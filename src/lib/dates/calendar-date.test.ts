import { describe, expect, it } from 'vitest';
import { formatCalendarDate, formatTimestampDay, isCalendarDate } from './calendar-date';

describe('isCalendarDate', () => {
  it.each(['2028-02-29', '2000-02-29', '2026-12-31', '0001-01-01', '9999-12-31'])(
    'accepts %s',
    (text) => expect(isCalendarDate(text)).toBe(true),
  );
  it.each([
    '2027-02-29',
    '1900-02-29',
    '2026-02-30',
    '2026-04-31',
    '2026-13-01',
    '2026-00-10',
    '0000-01-01',
    '2026-1-1',
    '2026-01-01T00:00:00Z',
    '',
    '01/02/2026',
  ])('refuses %s', (text) => expect(isCalendarDate(text)).toBe(false));
});

describe('formatting never shifts a day', () => {
  it('formats the stored day exactly, in any time zone, without building a Date', () => {
    expect(formatCalendarDate('2026-01-01')).toBe('1 Jan 2026');
    expect(formatCalendarDate('2028-02-29')).toBe('29 Feb 2028');
    expect(formatCalendarDate('2026-12-31')).toBe('31 Dec 2026');
  });

  it('uses the UTC day of a timestamp', () => {
    expect(formatTimestampDay('2026-03-31T23:59:59.999Z')).toBe('31 Mar 2026');
    expect(formatTimestampDay('2026-04-01T00:00:00.000Z')).toBe('1 Apr 2026');
  });

  it('shows anything unexpected verbatim', () => {
    expect(formatCalendarDate('2027-02-29')).toBe('2027-02-29');
  });
});
