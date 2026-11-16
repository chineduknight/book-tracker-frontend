import { libraryRoute } from '@/server/http/library-route';
import { returnLoan } from '@/server/lending/lending-operations';

export const dynamic = 'force-dynamic';

export const PUT = libraryRoute('PUT', returnLoan);
