import { libraryRoute } from '@/server/http/library-route';
import { listBookSessions, startSession } from '@/server/reading/reading-operations';

export const dynamic = 'force-dynamic';

export const GET = libraryRoute('GET', listBookSessions);
export const POST = libraryRoute('POST', startSession);
