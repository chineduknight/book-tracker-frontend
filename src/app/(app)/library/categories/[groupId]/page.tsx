import type { Metadata } from 'next';
import { GroupDetailPage } from '@/components/library/group-pages';
import { requireSignedInProfile } from '@/server/current-session';

export const metadata: Metadata = { title: 'Category' };

export default async function Page({
  params,
  searchParams,
}: PageProps<'/library/categories/[groupId]'>) {
  await requireSignedInProfile();
  const { groupId } = await params;
  return <GroupDetailPage kind="categories" groupId={groupId} searchParams={await searchParams} />;
}
