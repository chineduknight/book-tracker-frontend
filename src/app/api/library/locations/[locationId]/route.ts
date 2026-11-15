import { libraryRoute } from '@/server/http/library-route';
import { updateLocation } from '@/server/library/library-operations';

export const dynamic = 'force-dynamic';

export const PATCH = libraryRoute('PATCH', updateLocation);
