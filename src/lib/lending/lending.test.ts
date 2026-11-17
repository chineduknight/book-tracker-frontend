import { describe, expect, it } from 'vitest';
import {
  EMPTY_LOAN_FORM,
  loanChanges,
  loanFormValuesOf,
  newLoanPayload,
  returnDateProblem,
  validateLoanForm,
  type LoanFormValues,
} from './loan-form';
import { loanListHref, parseLoanListQuery } from './queries';
import { utcToday } from './rules';
import { loanReference, loanStateOn, type Loan } from './types';

const NOW = '2026-11-15T10:00:00.000Z';
const loan: Loan = {
  id: '665f1c2ab4e5d1a2b3c4d5e6',
  copyId: 'c'.repeat(24),
  bookId: 'b'.repeat(24),
  borrowerName: 'Ada',
  borrowerContact: 'ada@example.test',
  lentOn: '2026-03-01',
  dueOn: '2026-03-15',
  returnedOn: null,
  note: 'Careful with the spine',
  createdAt: NOW,
  updatedAt: NOW,
};
const returned: Loan = { ...loan, returnedOn: '2026-03-10' };
const values = (changes: Partial<LoanFormValues> = {}, base: Loan = loan) => ({
  ...loanFormValuesOf(base),
  ...changes,
});

describe('loanStateOn: overdue exactly as the API defines it', () => {
  it('is overdue only when still out and due strictly before the reference day', () => {
    expect(loanStateOn(loan, '2026-03-16')).toBe('overdue'); // due yesterday
    expect(loanStateOn(loan, '2026-03-15')).toBe('active'); // due today is not overdue
    expect(loanStateOn(loan, '2026-03-14')).toBe('active');
  });

  it('never calls a loan without a due day, or a returned loan, overdue', () => {
    expect(loanStateOn({ ...loan, dueOn: undefined }, '2099-01-01')).toBe('active');
    expect(loanStateOn(returned, '2099-01-01')).toBe('returned');
  });

  it('compares calendar days as text, so leap days and year ends hold in any time zone', () => {
    expect(loanStateOn({ ...loan, dueOn: '2028-02-29' }, '2028-03-01')).toBe('overdue');
    expect(loanStateOn({ ...loan, dueOn: '2026-12-31' }, '2027-01-01')).toBe('overdue');
  });

  it('takes "today" as the UTC calendar day, as the API does', () => {
    expect(utcToday(new Date('2026-03-15T23:30:00-11:00'))).toBe('2026-03-16');
    expect(utcToday(new Date('2026-03-16T00:30:00+14:00'))).toBe('2026-03-15');
  });

  it('gives each loan a stable reference', () => {
    expect(loanReference(loan)).toBe('#c4d5e6');
  });
});

describe('validateLoanForm', () => {
  const ok = (form: LoanFormValues, returnedLoan = false) =>
    Object.values(validateLoanForm(form, { returned: returnedLoan })).filter(Boolean);

  it('requires a borrower and an explicit lent day; nothing is prefilled', () => {
    const errors = validateLoanForm(EMPTY_LOAN_FORM, { returned: false });
    expect(errors.borrowerName).toBe('Enter who is borrowing the copy.');
    expect(errors.lentOn).toBe('Enter the day you lent it.');
    expect(EMPTY_LOAN_FORM.lentOn).toBe('');
  });

  it('accepts future days and leap days, and refuses impossible ones', () => {
    expect(ok(values({ lentOn: '2099-01-01', dueOn: '2099-02-01' }))).toEqual([]);
    expect(ok(values({ lentOn: '2028-02-29', dueOn: '2028-02-29' }))).toEqual([]);
    expect(validateLoanForm(values({ lentOn: '2027-02-29' }), { returned: false }).lentOn).toMatch(
      /real date/,
    );
  });

  it('keeps due and return days on or after the lent day', () => {
    expect(validateLoanForm(values({ dueOn: '2026-02-28' }), { returned: false }).dueOn).toMatch(
      /before the lent date/,
    );
    expect(
      validateLoanForm(values({ returnedOn: '2026-02-28' }, returned), { returned: true })
        .returnedOn,
    ).toMatch(/before the lent date/);
    expect(
      validateLoanForm(values({ returnedOn: '' }, returned), { returned: true }).returnedOn,
    ).toMatch(/Enter the day/);
  });

  it.each([
    ['borrowerName', 'x'.repeat(161)],
    ['borrowerContact', 'x'.repeat(201)],
    ['note', 'x'.repeat(2_001)],
  ] as const)('limits %s', (field, value) => {
    expect(validateLoanForm(values({ [field]: value }), { returned: false })[field]).toBeTruthy();
  });
});

describe('newLoanPayload', () => {
  it('omits blank optional fields and never sends a return day', () => {
    expect(
      newLoanPayload({
        ...EMPTY_LOAN_FORM,
        borrowerName: '  Grace Hopper ',
        lentOn: '2026-11-16',
        borrowerContact: '   ',
        returnedOn: '2026-11-17',
      }),
    ).toEqual({ borrowerName: 'Grace Hopper', lentOn: '2026-11-16' });
  });
});

describe('loanChanges', () => {
  it('sends nothing when nothing changed', () => {
    expect(loanChanges(loan, values())).toEqual({});
    expect(loanChanges(loan, values({ borrowerName: '  Ada  ' }))).toEqual({});
  });

  it('clears optional fields with null and sends only what changed', () => {
    expect(
      loanChanges(
        loan,
        values({ borrowerContact: '', dueOn: '', note: ' ', lentOn: '2026-03-02' }),
      ),
    ).toEqual({
      borrowerContact: null,
      dueOn: null,
      note: null,
      lentOn: '2026-03-02',
    });
  });

  it('never sends a return day for an active loan, and never null for a returned one', () => {
    expect(loanChanges(loan, values({ returnedOn: '2026-03-20' }))).toEqual({});
    expect(loanChanges(returned, values({ returnedOn: '2026-03-12' }, returned))).toEqual({
      returnedOn: '2026-03-12',
    });
    expect(loanChanges(returned, values({ returnedOn: '' }, returned))).toEqual({});
  });

  it('checks a chosen return day', () => {
    expect(returnDateProblem('', '2026-03-01')).toMatch(/Enter the day/);
    expect(returnDateProblem('2026-02-28', '2026-03-01')).toMatch(/before the lent date/);
    expect(returnDateProblem('2026-03-01', '2026-03-01')).toBeUndefined();
  });
});

describe('parseLoanListQuery', () => {
  it('defaults to active loans, newest recorded first', () => {
    expect(parseLoanListQuery({})).toEqual({
      status: 'active',
      sort: 'recent',
      page: 1,
      asOf: undefined,
    });
  });

  it('keeps asOf only for the overdue view, and only a real day', () => {
    const leapDay = parseLoanListQuery({ status: 'overdue', asOf: '2028-02-29' });
    expect([leapDay.asOf, leapDay.rejectedAsOf]).toEqual(['2028-02-29', undefined]);
    const elsewhere = parseLoanListQuery({ status: 'all', asOf: '2026-01-01' });
    expect([elsewhere.asOf, elsewhere.rejectedAsOf]).toEqual([undefined, undefined]);
    // Not part of the address for other views, so a bad value there is simply ignored.
    expect(
      parseLoanListQuery({ status: 'returned', asOf: 'garbage' }).rejectedAsOf,
    ).toBeUndefined();
  });

  it('reports, never replaces, an overdue reference day that is not one valid day', () => {
    const cases: [string | string[], string][] = [
      ['2027-02-29', '2027-02-29'],
      ['2026-13-01', '2026-13-01'],
      ['16/11/2026', '16/11/2026'],
      ['', ''],
      ['<script>alert(1)</script>', '<script>alert(1)</script>'],
      [['2026-01-01', '2026-02-01'], '2026-01-01, 2026-02-01'],
    ];
    for (const [asOf, shown] of cases) {
      expect(parseLoanListQuery({ status: 'overdue', asOf })).toMatchObject({
        asOf: undefined,
        rejectedAsOf: shown,
      });
    }
    expect(parseLoanListQuery({ status: 'overdue' }).rejectedAsOf).toBeUndefined();
  });

  it('ignores repeated and unknown values, and round-trips canonical links', () => {
    expect(parseLoanListQuery({ status: ['active', 'all'], sort: 'due' })).toMatchObject({
      status: 'active',
      sort: 'recent',
    });
    const query = { status: 'overdue', sort: 'oldest', page: 2, asOf: '2026-03-16' } as const;
    expect(loanListHref(query)).toBe('/lending?status=overdue&sort=oldest&asOf=2026-03-16&page=2');
    expect(loanListHref({ ...query, status: 'returned' })).toBe(
      '/lending?status=returned&sort=oldest&page=2',
    );
  });
});
