import type { Metadata } from 'next';
import { SearchX } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';

export const metadata: Metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <AppShell>
      <PageHeader title="Page not found" description="There is no page at this address." />
      <EmptyState
        icon={SearchX}
        title="Nothing here"
        description="The link may be mistyped, or the page may not exist yet."
        action={{ href: '/', label: 'Go to Home' }}
      />
    </AppShell>
  );
}
