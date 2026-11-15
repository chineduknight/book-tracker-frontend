import type { ReactNode } from 'react';
import { PublicFrame } from '@/components/layout/public-frame';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <PublicFrame>{children}</PublicFrame>;
}
