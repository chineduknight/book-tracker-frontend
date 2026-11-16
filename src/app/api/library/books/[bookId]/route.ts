import { libraryRoute } from '@/server/http/library-route';
import { deleteBook, updateBook } from '@/server/library/library-operations';

export const dynamic = 'force-dynamic';

export const PATCH = libraryRoute('PATCH', updateBook);
export const DELETE = libraryRoute('DELETE', deleteBook);
