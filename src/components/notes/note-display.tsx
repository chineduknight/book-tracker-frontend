import { Badge } from '@/components/ui/badge';
import { NOTE_KIND_LABELS } from '@/lib/notes/rules';
import { plainTextOf } from '@/lib/notes/format';
import type { Note } from '@/lib/notes/types';
import { FormattedNote } from './formatted-note';

/*
 * Safe presentation of untrusted, reader-written text. Notes and commentary are formatted by a
 * small in-house formatter (formatted-note.tsx) that builds React elements, never HTML, so
 * `<script>`, `<img onerror>`, `javascript:` links and remote images stay the characters they are
 * and never load or run. A highlight's quotation is shown exactly as typed. No
 * `dangerouslySetInnerHTML`, no previews of linked pages.
 */

export function NoteKindBadge({ note }: { note: Pick<Note, 'kind'> }) {
  return (
    <Badge
      className={
        note.kind === 'highlight' ? 'border-accent bg-accent-soft text-accent-ink' : undefined
      }
    >
      {NOTE_KIND_LABELS[note.kind]}
    </Badge>
  );
}

/** "Chapter 3 · page 42", from the reader's own labels; page is a reference, not progress. */
export function noteLocation(note: Pick<Note, 'chapter' | 'pageNumber'>): string | undefined {
  const parts = [
    note.chapter,
    note.pageNumber === undefined ? undefined : `page ${note.pageNumber}`,
  ];
  const text = parts.filter(Boolean).join(' · ');
  return text || undefined;
}

/** The first characters of a note, cut at a character boundary, for lists. */
export function noteExcerpt(text: string, max = 280): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : `${chars.slice(0, max).join('').trimEnd()}…`;
}

const SOURCE_TEXT = 'whitespace-pre-wrap break-words text-ink';

/** A note, formatted; or a highlight's quotation, exactly as typed. */
export function NoteContent({ note }: { note: Pick<Note, 'kind' | 'content'> }) {
  if (note.kind === 'highlight') {
    return (
      <figure className="flex flex-col gap-1">
        <figcaption className="text-xs font-medium text-ink-muted">Quotation</figcaption>
        <blockquote className={`border-l-4 border-accent pl-4 font-serif text-lg ${SOURCE_TEXT}`}>
          {note.content}
        </blockquote>
      </figure>
    );
  }
  return <FormattedNote source={note.content} />;
}

export function NoteCommentary({ commentary }: { commentary: string | undefined }) {
  if (commentary === undefined) return null;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium text-ink-muted">Your commentary</p>
      <FormattedNote source={commentary} />
    </div>
  );
}

/** A short preview for lists: highlights in quotation marks, notes without formatting marks. */
export function NoteExcerpt({ note }: { note: Pick<Note, 'kind' | 'content'> }) {
  const excerpt = noteExcerpt(note.kind === 'highlight' ? note.content : plainTextOf(note.content));
  return (
    <p className="line-clamp-4 text-sm whitespace-pre-line break-words text-ink">
      {note.kind === 'highlight' ? `“${excerpt}”` : excerpt}
    </p>
  );
}
