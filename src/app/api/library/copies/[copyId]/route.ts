import { libraryRoute } from '@/server/http/library-route';
import { deleteCopy, updateCopy } from '@/server/library/library-operations';

export const dynamic = 'force-dynamic';

export const PATCH = libraryRoute('PATCH', updateCopy);
export const DELETE = libraryRoute('DELETE', deleteCopy);
