import { libraryRoute } from '@/server/http/library-route';
import { checkDuplicateBooks } from '@/server/library/library-operations';

export const dynamic = 'force-dynamic';

export const GET = libraryRoute('GET', checkDuplicateBooks);
