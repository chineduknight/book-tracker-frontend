import 'server-only';
import { MAX_NOTE_REQUEST_BYTES } from '@/lib/notes/rules';
import type { LibraryOperation } from '../http/library-route';
import * as notes from './note-api';
import { createNoteSchema, updateNoteSchema } from './note-schemas';

/*
 * Every browser-facing notes operation. Note writes carry up to 20,000 characters of content plus
 * commentary, so they use the API's own 100 kB body limit instead of the library's 32 KiB.
 */
function operation<Input, Result, IdName extends string = never>(
  definition: LibraryOperation<Input, Result, IdName>,
) {
  return definition;
}

export const createNote = operation({
  ids: ['bookId'],
  body: createNoteSchema,
  maxBodyBytes: MAX_NOTE_REQUEST_BYTES,
  successStatus: 201,
  run: (api, { ids, input }) => notes.createNote(api, ids.bookId, input),
});

export const updateNote = operation({
  ids: ['noteId'],
  body: updateNoteSchema,
  maxBodyBytes: MAX_NOTE_REQUEST_BYTES,
  run: (api, { ids, input }) => notes.updateNote(api, ids.noteId, input),
});

export const deleteNote = operation({
  ids: ['noteId'],
  run: (api, { ids }) => notes.deleteNote(api, ids.noteId),
});
