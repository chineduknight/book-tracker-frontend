import type { Page } from '@playwright/test';
import { libraryApi, uniqueWord } from './reader';

export interface SeededReading {
  bookId: string;
  activeSessionId: string;
  finishedSessionId: string;
  noteId: string;
  highlightId: string;
}

const LONG_WORD = 'Supercalifragilisticexpialidociouslyunbreakablewordwithoutanyspaces';

/** Real readings and notes in the reader's account, created through the BFF. */
export async function seedReadingAndNotes(page: Page, origin: string): Promise<SeededReading> {
  const word = uniqueWord('rn');
  const book = await libraryApi<{ id: string }>(page, origin, 'POST', '/api/library/books', {
    title: `Middlemarch ${word}`,
    authors: ['George Eliot'],
    format: 'physical',
    pageCount: 880,
    chapterCount: 86,
  });
  const finished = await libraryApi<{ id: string }>(
    page,
    origin,
    'POST',
    `/api/reading/books/${book.id}/sessions`,
    {
      status: 'completed',
      startedOn: '2025-01-04',
      completedOn: '2025-03-30',
      rating: 5,
      summary: 'A study of provincial life,\nand of patience.',
    },
  );
  const active = await libraryApi<{ id: string }>(
    page,
    origin,
    'POST',
    `/api/reading/books/${book.id}/sessions`,
    { startedOn: '2026-11-01', progress: { unit: 'pages', value: 212 } },
  );
  const note = await libraryApi<{ id: string }>(
    page,
    origin,
    'POST',
    `/api/notes/books/${book.id}`,
    {
      kind: 'note',
      title: 'On Dorothea',
      content: `# Ardent souls\n\nDorothea wants a life of *meaning*.\n\n- Casaubon\n- Ladislaw\n\n${LONG_WORD}`,
      chapter: 'Book One',
      pageNumber: 12,
    },
  );
  const highlight = await libraryApi<{ id: string }>(
    page,
    origin,
    'POST',
    `/api/notes/books/${book.id}`,
    {
      kind: 'highlight',
      content:
        'For the growing good of the world is partly dependent on unhistoric acts;\nand that things are not so ill with you and me as they might have been.',
      commentary: 'The *finale*. Worth rereading.',
      chapter: 'Finale',
      pageNumber: 838,
      readingSessionId: active.id,
    },
  );
  return {
    bookId: book.id,
    activeSessionId: active.id,
    finishedSessionId: finished.id,
    noteId: note.id,
    highlightId: highlight.id,
  };
}

export function readingAndNotesPaths(seeded: SeededReading): string[] {
  return [
    '/reading',
    '/reading?status=completed&sort=oldest',
    `/reading/new?bookId=${seeded.bookId}`,
    `/reading/${seeded.activeSessionId}`,
    `/reading/${seeded.finishedSessionId}`,
    '/notes',
    '/notes?q=nothingmatchesthisword',
    `/notes?bookId=${seeded.bookId}&kind=highlight`,
    '/notes?bookId=not-an-id',
    '/notes/new',
    `/notes/new?bookId=${seeded.bookId}&readingSessionId=${seeded.activeSessionId}`,
    `/notes/${seeded.noteId}`,
    `/notes/${seeded.highlightId}`,
    `/notes/${seeded.noteId}/edit`,
    `/library/books/${seeded.bookId}`,
  ];
}
