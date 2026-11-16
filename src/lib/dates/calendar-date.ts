/**
 * Calendar days (`YYYY-MM-DD`) as the API stores them: a day the reader chose, not an instant.
 * Nothing here ever builds a local-time Date from one, so no time zone can move it by a day.
 */
const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** The same rule as the API: years 0001–9999 and a day that exists (2028-02-29 yes, 2027-02-29 no). */
export function isCalendarDate(text: string): boolean {
  const parts = CALENDAR_DATE.exec(text);
  if (!parts) return false;
  const [year, month, day] = parts.slice(1).map(Number) as [number, number, number];
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  return day <= daysInMonth(year, month);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return isLeap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** "29 Feb 2028", straight from the text: the day shown is always the day stored. */
export function formatCalendarDate(text: string): string {
  const parts = CALENDAR_DATE.exec(text);
  if (!parts || !isCalendarDate(text)) return text;
  const [, year, month, day] = parts as unknown as [string, string, string, string];
  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
}

/** The UTC day of an API timestamp, e.g. when a record was added, formatted like a calendar day. */
export function formatTimestampDay(isoTimestamp: string): string {
  const day = isoTimestamp.slice(0, 10);
  return isCalendarDate(day) ? formatCalendarDate(day) : isoTimestamp;
}
