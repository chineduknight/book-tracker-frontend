import type { Metadata } from 'next';
import { NotebookPen } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { findDestination } from '@/config/navigation';
import { requireSignedInProfile } from '@/server/current-session';

export const metadata: Metadata = { title: 'Notes' };

export default async function NotesPage() {
  await requireSignedInProfile();
  const { label, summary } = findDestination('/notes');

  return (
    <>
      <PageHeader title={label} description={summary} />
      <EmptyState
        icon={NotebookPen}
        title="No notes yet"
        description="Writing chapter notes, saving quotes and searching across them arrive in the Notes milestone."
        action={{ href: '/reading', label: 'Go to Reading' }}
      />
    </>
  );
}
