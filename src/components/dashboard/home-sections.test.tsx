import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DashboardSummary, ReadingStatistics } from '@/lib/dashboard/types';
import type { ActivityItem } from '@/server/dashboard/dashboard-pages';
import { AtAGlance, Attention, ReadingBreakdown, RecentActivity } from './home-sections';

const summary: DashboardSummary = {
  asOf: '2026-11-16',
  catalogue: { totalBooks: 5, physicalBooks: 3, ebooks: 2, physicalCopies: 4 },
  reading: {
    unreadBooks: 2,
    currentlyReadingBooks: 2,
    completedBooks: 1,
    booksEverCompleted: 2,
    totalSessions: 5,
    completedSessions: 3,
    rereadSessions: 1,
  },
  notes: { notes: 3, highlights: 1 },
  wishlist: { wanted: 2, acquired: 1 },
  lending: { activeLoans: 2, overdueLoans: 1, returnedLoans: 4 },
};
const counts = (total: number) => ({
  books: { total, unread: total, reading: 0, completed: 0, everCompleted: 0 },
  sessions: { total: 0, inProgress: 0, completed: 0, rereads: 0 },
});
const statistics: ReadingStatistics = {
  overall: counts(5),
  byFormat: { physical: counts(3), ebook: counts(2) },
};
const ok = <T,>(value: T) => ({ status: 'ok' as const, value });
const down = { status: 'unavailable' as const };

describe('Home sections', () => {
  it('shows the API’s counts, with "ever finished" separate from "reading now"', () => {
    render(<AtAGlance data={ok(summary)} />);
    const tile = (label: string) => screen.getByText(label).closest('a')!;
    expect(within(tile('Books')).getByText('5')).toBeInTheDocument();
    expect(within(tile('Books')).getByText('3 physical · 2 ebooks')).toBeInTheDocument();
    expect(within(tile('Reading now')).getByText('2')).toBeInTheDocument();
    expect(within(tile('Books ever finished')).getByText('2')).toBeInTheDocument();
    expect(within(tile('Overdue loans')).getByText('As of 16 Nov 2026 (UTC)')).toBeInTheDocument();
    expect(tile('Overdue loans')).toHaveAttribute(
      'href',
      '/lending?status=overdue&asOf=2026-11-16',
    );
  });

  it('shows an outage as an error, never as a wall of zeroes', () => {
    const { container } = render(
      <>
        <Attention data={down} />
        <AtAGlance data={down} />
        <ReadingBreakdown data={down} />
        <RecentActivity data={down} />
      </>,
    );
    expect(screen.getByText('Your library’s numbers couldn’t be loaded.')).toBeInTheDocument();
    expect(screen.getByText('Reading statistics couldn’t be loaded.')).toBeInTheDocument();
    expect(screen.getByText('Recent activity couldn’t be loaded.')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\b0\b/);
    expect(screen.queryByText(/No loans are overdue/)).toBeNull();
  });

  it('claims "nothing overdue" only from a loaded summary, with its reference day', () => {
    const none = { ...summary, lending: { ...summary.lending, overdueLoans: 0 } };
    const { rerender } = render(<Attention data={ok(none)} />);
    expect(screen.getByText(/No loans are overdue as of 16 Nov 2026/)).toBeInTheDocument();
    rerender(<Attention data={ok(summary)} />);
    expect(screen.getByText(/1 loan is overdue/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review overdue loans' })).toHaveAttribute(
      'href',
      '/lending?status=overdue&asOf=2026-11-16',
    );
  });

  it('breaks reading down by format as a table, with a zero state and no percentages', () => {
    const { container, rerender } = render(<ReadingBreakdown data={ok(statistics)} />);
    const books = screen.getByRole('table', { name: 'Books' });
    expect(within(books).getByRole('columnheader', { name: 'Physical' })).toBeInTheDocument();
    expect(container.textContent).not.toContain('%');
    rerender(<ReadingBreakdown data={ok({ ...statistics, overall: counts(0) })} />);
    expect(screen.getByText(/No books yet/)).toBeInTheDocument();
  });

  it('labels only what was recorded, and never links to a record that is gone', () => {
    const at = '2026-11-16T09:00:00.000Z';
    const items: ActivityItem[] = [
      {
        activity: {
          type: 'reading_session_recorded',
          resourceId: 'a'.repeat(24),
          bookId: 'b'.repeat(24),
          occurredAt: at,
        },
        href: `/reading/${'a'.repeat(24)}`,
        subject: 'Middlemarch',
        bookGone: false,
      },
      {
        activity: {
          type: 'loan_recorded',
          resourceId: 'c'.repeat(24),
          bookId: 'd'.repeat(24),
          occurredAt: at,
        },
        href: `/lending/${'c'.repeat(24)}`,
        subject: null,
        bookGone: true,
      },
      {
        activity: {
          type: 'note_added',
          resourceId: 'e'.repeat(24),
          bookId: 'd'.repeat(24),
          occurredAt: at,
        },
        href: null,
        subject: null,
        bookGone: true,
      },
    ];
    const { container } = render(<RecentActivity data={ok(items)} />);
    expect(screen.getByText('Reading recorded')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/finished|returned/i);
    expect(screen.getByRole('link', { name: 'A book no longer in your library' })).toHaveAttribute(
      'href',
      `/lending/${'c'.repeat(24)}`,
    );
    expect(screen.getAllByText('A book no longer in your library')).toHaveLength(2);
    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(screen.getAllByText('16 Nov 2026')).toHaveLength(3);
  });
});
