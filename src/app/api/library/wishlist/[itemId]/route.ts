import { libraryRoute } from '@/server/http/library-route';
import { deleteWish, updateWish } from '@/server/library/library-operations';

export const dynamic = 'force-dynamic';

export const PATCH = libraryRoute('PATCH', updateWish);
export const DELETE = libraryRoute('DELETE', deleteWish);
