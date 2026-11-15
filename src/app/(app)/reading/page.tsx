import type { Metadata } from 'next';
import { BookOpen } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { findDestination } from '@/config/navigation';

export const metadata: Metadata = { title: 'Reading' };

export default function ReadingPage() {
  const { label, summary } = findDestination('/reading');

  return (
    <>
      <PageHeader title={label} description={summary} />
      <EmptyState
        icon={BookOpen}
        title="Nothing in progress yet"
        description="Starting a book, logging a reading session and tracking your progress arrive in the Reading milestone."
        action={{ href: '/library', label: 'Go to the Library' }}
      />
    </>
  );
}
