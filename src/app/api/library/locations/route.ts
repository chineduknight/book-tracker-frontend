import { libraryRoute } from '@/server/http/library-route';
import { createLocation } from '@/server/library/library-operations';

export const dynamic = 'force-dynamic';

export const POST = libraryRoute('POST', createLocation);
