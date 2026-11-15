import type { Metadata } from 'next';
import { GroupDetailPage } from '@/components/library/group-pages';
import { requireSignedInProfile } from '@/server/current-session';

export const metadata: Metadata = { title: 'Collection' };

export default async function Page({
  params,
  searchParams,
}: PageProps<'/library/collections/[groupId]'>) {
  await requireSignedInProfile();
  const { groupId } = await params;
  return <GroupDetailPage kind="collections" groupId={groupId} searchParams={await searchParams} />;
}
