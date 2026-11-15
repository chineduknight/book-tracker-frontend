import { libraryRoute } from '@/server/http/library-route';
import { createBook, searchBooks } from '@/server/library/library-operations';

export const dynamic = 'force-dynamic';

export const GET = libraryRoute('GET', searchBooks);
export const POST = libraryRoute('POST', createBook);
