import type { Metadata } from 'next';
import { MapPin } from 'lucide-react';
import { DataUnavailable } from '@/components/library/data-unavailable';
import { LibraryBreadcrumb } from '@/components/library/library-breadcrumb';
import { LocationList } from '@/components/library/location-list';
import { NamedItemForm } from '@/components/library/named-item-form';
import { Pagination } from '@/components/library/pagination';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { SectionHeader } from '@/components/ui/section-header';
import { hrefWithQuery, parsePage } from '@/lib/library/queries';
import { requireSignedInProfile } from '@/server/current-session';
import { listLocations } from '@/server/library/library-api';
import { loadAsReader } from '@/server/library/reader-data';

export const metadata: Metadata = { title: 'Locations' };

const pageHref = (page: number) => hrefWithQuery('/library/locations', { page }, { page: 1 });

export default async function LocationsPage({ searchParams }: PageProps<'/library/locations'>) {
  await requireSignedInProfile();
  const page = parsePage(await searchParams);
  const result = await loadAsReader((api) => listLocations(api, page));

  return (
    <>
      <PageHeader
        title="Locations"
        description="Where your physical copies live. Assign a location to each copy from the book’s page."
        before={<LibraryBreadcrumb />}
      />
      <section aria-labelledby="add-location" className="mb-10">
        <SectionHeader id="add-location" title="Add a location" />
        <Card>
          <NamedItemForm noun="location" path="/api/library/locations" />
        </Card>
      </section>
      <section aria-labelledby="your-locations">
        <SectionHeader
          id="your-locations"
          title="Your locations"
          description="Alphabetical. Locations can be renamed but not deleted, because copies may refer to them."
        />
        {result.status !== 'ok' ? (
          <DataUnavailable what="locations" retryHref={pageHref(page)} />
        ) : result.value.pagination.total === 0 ? (
          <EmptyState
            icon={MapPin}
            title="No locations yet"
            description="Add places such as Home, Office or Study Shelf, then assign copies to them."
          />
        ) : (
          <>
            <LocationList locations={result.value.items} />
            <Pagination pagination={result.value.pagination} noun="locations" hrefFor={pageHref} />
          </>
        )}
      </section>
    </>
  );
}
