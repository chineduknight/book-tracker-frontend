/** Note and highlight values and limits, mirroring book-tracker-backend's notes module exactly. */
export const NOTE_KINDS = ['note', 'highlight'] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export const NOTE_KIND_LABELS: Record<NoteKind, string> = { note: 'Note', highlight: 'Highlight' };

export const NOTE_LIMITS = {
  content: { note: 20_000, highlight: 5_000 } satisfies Record<NoteKind, number>,
  title: 160,
  commentary: 5_000,
  chapter: 200,
  pageNumber: 100_000,
  search: 120,
} as const;

export const NOTE_SORTS = ['recent', 'oldest'] as const;
export type NoteSort = (typeof NOTE_SORTS)[number];

/**
 * The API accepts JSON bodies up to 100 kB (Express "100kb" = 102,400 bytes). Note writes through
 * the BFF use the same cap: a 20,000-character note fits, while library writes keep 32 KiB and
 * authentication 8 KiB. Text made mostly of escaped control characters can still exceed it.
 */
export const MAX_NOTE_REQUEST_BYTES = 100 * 1024;

/** The bytes a JSON body occupies on the wire, as the BFF and the API count them. */
export function jsonByteLength(body: unknown): number {
  return new TextEncoder().encode(JSON.stringify(body)).byteLength;
}
