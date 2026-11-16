import type { Metadata } from 'next';
import {
  AtAGlance,
  Attention,
  QuickActions,
  ReadingBreakdown,
  RecentActivity,
} from '@/components/dashboard/home-sections';
import { PageHeader } from '@/components/ui/page-header';
import { requireSignedInProfile } from '@/server/current-session';
import { getReadingStatistics, getSummary } from '@/server/dashboard/dashboard-api';
import { loadRecentActivity } from '@/server/dashboard/dashboard-pages';
import { loadAsReader } from '@/server/library/reader-data';

export const metadata: Metadata = { title: 'Home' };

/**
 * A read-only overview computed by the API on each request. The summary, the reading breakdown and
 * recent activity load independently: one failing never blanks the others, and a failed summary is
 * an error, never a wall of zeroes.
 */
export default async function HomePage() {
  const { name } = await requireSignedInProfile();
  const [summary, statistics, activity] = await Promise.all([
    loadAsReader((api) => getSummary(api)),
    loadAsReader((api) => getReadingStatistics(api)),
    loadAsReader((api) => loadRecentActivity(api)),
  ]);
  return (
    <>
      <PageHeader
        title={`Welcome back, ${name}`}
        description="Your library, reading, notes and loans at a glance."
      />
      <QuickActions />
      <Attention data={summary} />
      <AtAGlance data={summary} />
      <ReadingBreakdown data={statistics} />
      <RecentActivity data={activity} />
    </>
  );
}
