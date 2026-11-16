import { SearchX } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';

/**
 * Inside the signed-in shell. A missing record and another reader's record look identical here,
 * as they do in the API.
 */
export default function AppNotFound() {
  return (
    <>
      <PageHeader
        title="Not found"
        description="This page or item doesn’t exist in your library."
      />
      <EmptyState
        icon={SearchX}
        title="Nothing here"
        description="It may have been deleted, or the link may be wrong."
        action={{ href: '/library', label: 'Go to the Library' }}
      />
    </>
  );
}
