import { libraryRoute } from '@/server/http/library-route';
import { acquireWish } from '@/server/library/library-operations';

export const dynamic = 'force-dynamic';

export const PUT = libraryRoute('PUT', acquireWish);
