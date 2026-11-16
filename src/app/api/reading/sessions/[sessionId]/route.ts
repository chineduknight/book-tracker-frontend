import { libraryRoute } from '@/server/http/library-route';
import { updateSession } from '@/server/reading/reading-operations';

export const dynamic = 'force-dynamic';

// There is no DELETE: the API keeps every reading, so history is never lost.
export const PATCH = libraryRoute('PATCH', updateSession);
