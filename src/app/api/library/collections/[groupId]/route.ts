import { libraryRoute } from '@/server/http/library-route';
import { groupOperations } from '@/server/library/library-operations';

export const dynamic = 'force-dynamic';

const operations = groupOperations('collections');

export const PATCH = libraryRoute('PATCH', operations.update);
export const DELETE = libraryRoute('DELETE', operations.remove);
