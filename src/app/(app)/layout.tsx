import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { requireSignedInProfile } from '@/server/current-session';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const profile = await requireSignedInProfile();
  return <AppShell profile={profile}>{children}</AppShell>;
}
