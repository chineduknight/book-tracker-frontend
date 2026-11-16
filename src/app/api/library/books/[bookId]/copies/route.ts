import { libraryRoute } from '@/server/http/library-route';
import { createCopy } from '@/server/library/library-operations';

export const dynamic = 'force-dynamic';

export const POST = libraryRoute('POST', createCopy);
