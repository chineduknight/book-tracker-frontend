import { describe, expect, it } from 'vitest';
import {
  EMPTY_SESSION_FORM,
  newSessionPayload,
  sessionChanges,
  sessionFormValuesOf,
  validateSessionForm,
  type SessionFormValues,
} from './session-form';
import type { ReadingSession } from './types';

const NOW = '2026-11-15T10:00:00.000Z';
const session: ReadingSession = {
  id: 'a'.repeat(24),
  bookId: 'b'.repeat(24),
  status: 'in_progress',
  progress: { unit: 'pages', value: 120 },
  startedOn: '2026-03-01',
  rating: 4,
  summary: 'So far, so good.',
  createdAt: NOW,
  updatedAt: NOW,
};
const values = (changes: Partial<SessionFormValues> = {}) => ({
  ...sessionFormValuesOf(session),
  ...changes,
});
const inProgress = {
  status: 'in_progress' as const,
  lengths: { pageCount: 300, chapterCount: 20 },
};
const finished = { ...inProgress, status: 'completed' as const };

describe('validateSessionForm', () => {
  it('accepts the current values and an empty form', () => {
    expect(Object.values(validateSessionForm(values(), inProgress)).filter(Boolean)).toEqual([]);
    expect(
      Object.values(validateSessionForm(EMPTY_SESSION_FORM, { ...inProgress, lengths: {} })).filter(
        Boolean,
      ),
    ).toEqual([]);
  });

  it('allows progress to go down: no invented "only forwards" rule', () => {
    expect(
      validateSessionForm(values({ progressValue: '3' }), inProgress).progressValue,
    ).toBeUndefined();
  });

  it('caps pages and chapters at the book’s known length, and explains it', () => {
    expect(
      validateSessionForm(values({ progressValue: '300' }), inProgress).progressValue,
    ).toBeUndefined();
    expect(validateSessionForm(values({ progressValue: '301' }), inProgress).progressValue).toBe(
      'This book has 300 pages; enter at most 300.',
    );
    expect(
      validateSessionForm(values({ progressUnit: 'chapters', progressValue: '21' }), inProgress)
        .progressValue,
    ).toBe('This book has 20 chapters; enter at most 20.');
  });

  it('falls back to the API’s ranges when the length is unknown', () => {
    const unknown = { ...inProgress, lengths: {} };
    expect(
      validateSessionForm(values({ progressValue: '100000' }), unknown).progressValue,
    ).toBeUndefined();
    expect(validateSessionForm(values({ progressValue: '100001' }), unknown).progressValue).toMatch(
      /at most 100,000/,
    );
    expect(
      validateSessionForm(values({ progressUnit: 'percent', progressValue: '101' }), inProgress)
        .progressValue,
    ).toMatch(/at most 100 percent/);
  });

  it.each([
    [{ progressValue: '4.5' }, 'progressValue'],
    [{ progressValue: '-1' }, 'progressValue'],
    [{ progressValue: '' }, 'progressValue'],
    [{ progressUnit: '' as const, progressValue: '3' }, 'progressUnit'],
    [{ startedOn: '2027-02-29' }, 'startedOn'],
    [{ rating: '6' }, 'rating'],
    [{ summary: 'x'.repeat(5_001) }, 'summary'],
  ])('reports %j on %s', (change, field) => {
    expect(
      validateSessionForm(values(change), inProgress)[field as keyof SessionFormValues],
    ).toBeTruthy();
  });

  it('allows a finish date only on a finished reading, never before the start', () => {
    expect(
      validateSessionForm(values({ completedOn: '2026-03-05' }), inProgress).completedOn,
    ).toMatch(/only be set on a finished/);
    expect(
      validateSessionForm(values({ completedOn: '2026-02-28' }), finished).completedOn,
    ).toMatch(/can’t be before/);
    expect(
      validateSessionForm(values({ completedOn: '2026-03-01' }), finished).completedOn,
    ).toBeUndefined();
    expect(
      validateSessionForm(values({ startedOn: '2028-02-29', completedOn: '2028-02-29' }), finished)
        .completedOn,
    ).toBeUndefined();
  });
});

describe('newSessionPayload', () => {
  it('starts an in-progress reading with nothing but what was entered (no dates invented)', () => {
    expect(newSessionPayload(EMPTY_SESSION_FORM, 'start')).toEqual({});
    expect(
      newSessionPayload(
        { ...EMPTY_SESSION_FORM, progressUnit: 'percent', progressValue: ' 12 ' },
        'start',
      ),
    ).toEqual({ progress: { unit: 'percent', value: 12 } });
  });

  it('records a finished read in one request, with no completion date unless given', () => {
    expect(newSessionPayload(EMPTY_SESSION_FORM, 'finished')).toEqual({ status: 'completed' });
    expect(
      newSessionPayload(
        { ...EMPTY_SESSION_FORM, completedOn: '2025-12-24', rating: '5', summary: '  Loved it\n ' },
        'finished',
      ),
    ).toEqual({ status: 'completed', completedOn: '2025-12-24', rating: 5, summary: 'Loved it' });
  });

  it('never sends a finish date on a reading that is only starting', () => {
    expect(
      newSessionPayload({ ...EMPTY_SESSION_FORM, completedOn: '2025-12-24' }, 'start'),
    ).toEqual({});
  });
});

describe('sessionChanges', () => {
  it('is empty when nothing changed, so no PATCH is sent', () => {
    expect(sessionChanges(session, values())).toEqual({});
    expect(sessionChanges(session, values({ summary: '  So far, so good.  ' }))).toEqual({});
  });

  it('replaces progress as one object and clears with null', () => {
    expect(sessionChanges(session, values({ progressValue: '90' }))).toEqual({
      progress: { unit: 'pages', value: 90 },
    });
    expect(
      sessionChanges(session, values({ progressUnit: 'percent', progressValue: '90' })),
    ).toEqual({
      progress: { unit: 'percent', value: 90 },
    });
    expect(
      sessionChanges(
        session,
        values({ progressUnit: '', progressValue: '', startedOn: '', rating: '', summary: ' ' }),
      ),
    ).toEqual({ progress: null, startedOn: null, rating: null, summary: null });
  });

  it('finishes only on request, and only with `completed`; never auto-completes at the end', () => {
    expect(sessionChanges(session, values({ progressValue: '300' }))).toEqual({
      progress: { unit: 'pages', value: 300 },
    });
    expect(sessionChanges(session, values(), { finish: true })).toEqual({ status: 'completed' });
    expect(
      sessionChanges(session, values({ completedOn: '2026-03-09' }), { finish: true }),
    ).toEqual({
      status: 'completed',
      completedOn: '2026-03-09',
    });
  });

  it('never reopens a finished reading', () => {
    const done = { ...session, status: 'completed' as const, completedOn: '2026-03-09' };
    const changes = sessionChanges(
      done,
      { ...sessionFormValuesOf(done), rating: '5' },
      { finish: true },
    );
    expect(changes).toEqual({ rating: 5 });
    expect(changes).not.toHaveProperty('status');
  });
});
