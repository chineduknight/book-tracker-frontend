import { libraryRoute } from '@/server/http/library-route';
import { groupOperations } from '@/server/library/library-operations';

export const dynamic = 'force-dynamic';

export const POST = libraryRoute('POST', groupOperations('categories').create);
