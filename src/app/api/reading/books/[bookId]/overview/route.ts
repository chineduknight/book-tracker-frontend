import { libraryRoute } from '@/server/http/library-route';
import { getReadingOverview } from '@/server/reading/reading-operations';

export const dynamic = 'force-dynamic';

export const GET = libraryRoute('GET', getReadingOverview);
