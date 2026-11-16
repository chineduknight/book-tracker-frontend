import { libraryRoute } from '@/server/http/library-route';
import { groupOperations } from '@/server/library/library-operations';

export const dynamic = 'force-dynamic';

const operations = groupOperations('categories');

export const PUT = libraryRoute('PUT', operations.addBook);
export const DELETE = libraryRoute('DELETE', operations.removeBook);
