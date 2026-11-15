import { libraryRoute } from '@/server/http/library-route';
import { createWish } from '@/server/library/library-operations';

export const dynamic = 'force-dynamic';

export const POST = libraryRoute('POST', createWish);
