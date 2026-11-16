import { libraryRoute } from '@/server/http/library-route';
import { deleteNote, updateNote } from '@/server/notes/note-operations';

export const dynamic = 'force-dynamic';

export const PATCH = libraryRoute('PATCH', updateNote);
export const DELETE = libraryRoute('DELETE', deleteNote);
