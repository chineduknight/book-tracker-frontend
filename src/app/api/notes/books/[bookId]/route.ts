import { libraryRoute } from '@/server/http/library-route';
import { createNote } from '@/server/notes/note-operations';

export const dynamic = 'force-dynamic';

export const POST = libraryRoute('POST', createNote);
