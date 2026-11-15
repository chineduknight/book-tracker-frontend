import type { Metadata } from 'next';
import { GroupListPage } from '@/components/library/group-pages';
import { requireSignedInProfile } from '@/server/current-session';

export const metadata: Metadata = { title: 'Categories' };

export default async function Page({ searchParams }: PageProps<'/library/categories'>) {
  await requireSignedInProfile();
  return <GroupListPage kind="categories" searchParams={await searchParams} />;
}
