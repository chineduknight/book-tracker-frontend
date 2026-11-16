import 'server-only';
import { z } from 'zod';
import { NOTE_KINDS, NOTE_LIMITS } from '@/lib/notes/rules';
import type { Note } from '@/lib/notes/types';

/*
 * Request schemas mirror book-tracker-backend's note.schema.ts exactly. Text is trimmed at its ends
 * only, never collapsed: line breaks, inner spaces and punctuation of notes and quotations stay as
 * written. `kind` and `readingSessionId` exist on create only; PATCH can never send them.
 */
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'must be a 24-character hexadecimal id');
const trimmed = (max: number) => z.string().trim().min(1).max(max);
const kind = z.enum(NOTE_KINDS);
const pageNumber = z.number().int().min(1).max(NOTE_LIMITS.pageNumber);

export const createNoteSchema = z
  .strictObject({
    kind,
    content: trimmed(NOTE_LIMITS.content.note),
    title: trimmed(NOTE_LIMITS.title).optional(),
    commentary: trimmed(NOTE_LIMITS.commentary).optional(),
    chapter: trimmed(NOTE_LIMITS.chapter).optional(),
    pageNumber: pageNumber.optional(),
    readingSessionId: objectId.nullable().optional(),
  })
  .superRefine(
    (note, context) => {
      const maximum = NOTE_LIMITS.content[note.kind];
      if (note.content.length > maximum) {
        context.addIssue({
          code: 'custom',
          path: ['content'],
          message: `must be at most ${maximum} characters for a ${note.kind}`,
        });
      }
    },
    {
      when: (payload) =>
        !payload.issues.some(
          (issue) => issue.path?.[0] === 'kind' || issue.path?.[0] === 'content',
        ),
    },
  );

export const updateNoteSchema = z
  .strictObject({
    content: trimmed(NOTE_LIMITS.content.note).optional(),
    title: trimmed(NOTE_LIMITS.title).nullable().optional(),
    commentary: trimmed(NOTE_LIMITS.commentary).nullable().optional(),
    chapter: trimmed(NOTE_LIMITS.chapter).nullable().optional(),
    pageNumber: pageNumber.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'must change at least one field',
    when: (payload) => payload.issues.length === 0,
  });

export type CreateNote = z.output<typeof createNoteSchema>;
export type UpdateNote = z.output<typeof updateNoteSchema>;

const responseId = z.string().regex(/^[0-9a-f]{24}$/);

export const noteSchema: z.ZodType<Note> = z.object({
  id: responseId,
  bookId: responseId,
  readingSessionId: responseId.nullable(),
  kind,
  content: z.string(),
  title: z.string().optional(),
  commentary: z.string().optional(),
  chapter: z.string().optional(),
  pageNumber: z.number().int().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
