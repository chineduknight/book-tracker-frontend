import type { Metadata } from 'next';
import { GroupListPage } from '@/components/library/group-pages';
import { requireSignedInProfile } from '@/server/current-session';

export const metadata: Metadata = { title: 'Collections' };

export default async function Page({ searchParams }: PageProps<'/library/collections'>) {
  await requireSignedInProfile();
  return <GroupListPage kind="collections" searchParams={await searchParams} />;
}
