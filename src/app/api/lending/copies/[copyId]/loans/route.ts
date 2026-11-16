import { libraryRoute } from '@/server/http/library-route';
import { createLoan } from '@/server/lending/lending-operations';

export const dynamic = 'force-dynamic';

export const POST = libraryRoute('POST', createLoan);
