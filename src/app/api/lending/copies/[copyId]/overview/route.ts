import { libraryRoute } from '@/server/http/library-route';
import { getCopyLoanOverview } from '@/server/lending/lending-operations';

export const dynamic = 'force-dynamic';

export const GET = libraryRoute('GET', getCopyLoanOverview);
