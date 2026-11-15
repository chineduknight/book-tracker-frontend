import { handleLogout } from '@/server/http/session-handlers';
import { withBffRuntime } from '@/server/http/with-bff-runtime';

export const dynamic = 'force-dynamic';

export const POST = withBffRuntime(handleLogout);
