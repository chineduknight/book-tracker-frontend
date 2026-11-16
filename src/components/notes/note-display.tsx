import { Badge } from '@/components/ui/badge';
import { NOTE_KIND_LABELS } from '@/lib/notes/rules';
import type { Note } from '@/lib/notes/types';

/*
 * Safe presentation of untrusted, reader-written text. Nothing here interprets Markdown or HTML:
 * every value is a React text node, so `<script>`, `<img onerror>`, `javascript:` links and remote
 * images are shown as the characters they are and never load or run. Line breaks and spacing are
 * preserved with CSS. No `dangerouslySetInnerHTML`, no renderer, no previews.
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

/** A note's Markdown source or a highlight's quotation, as literal text. */
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
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium text-ink-muted">
        Written in Markdown · shown as plain text
      </p>
      <div className={`rounded-lg bg-surface-muted p-4 font-mono text-sm ${SOURCE_TEXT}`}>
        {note.content}
      </div>
    </div>
  );
}

export function NoteCommentary({ commentary }: { commentary: string | undefined }) {
  if (commentary === undefined) return null;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium text-ink-muted">
        Your commentary · Markdown shown as plain text
      </p>
      <div className={`rounded-lg bg-surface-muted p-4 font-mono text-sm ${SOURCE_TEXT}`}>
        {commentary}
      </div>
    </div>
  );
}

/** A short, literal preview for lists: highlights in quotation marks, notes as written. */
export function NoteExcerpt({ note }: { note: Pick<Note, 'kind' | 'content'> }) {
  const excerpt = noteExcerpt(note.content);
  return (
    <p className="line-clamp-4 text-sm whitespace-pre-line break-words text-ink">
      {note.kind === 'highlight' ? `“${excerpt}”` : excerpt}
    </p>
  );
}
