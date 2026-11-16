import { libraryRoute } from '@/server/http/library-route';
import { updateLoan } from '@/server/lending/lending-operations';

export const dynamic = 'force-dynamic';

// There is no DELETE: a loan is history and an obligation, and the API keeps every one.
export const PATCH = libraryRoute('PATCH', updateLoan);
