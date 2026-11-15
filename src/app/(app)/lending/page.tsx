import type { Metadata } from 'next';
import { Repeat } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { findDestination } from '@/config/navigation';
import { requireSignedInProfile } from '@/server/current-session';

export const metadata: Metadata = { title: 'Lending' };

export default async function LendingPage() {
  await requireSignedInProfile();
  const { label, summary } = findDestination('/lending');

  return (
    <>
      <PageHeader title={label} description={summary} />
      <EmptyState
        icon={Repeat}
        title="No loans to show"
        description="Lending a copy, recording when it is due and marking it returned arrive in the Lending milestone."
        action={{ href: '/library', label: 'Go to the Library' }}
      />
    </>
  );
}
