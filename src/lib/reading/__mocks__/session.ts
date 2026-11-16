import type { ReadingSession } from '@/lib/reading/types';
import type { BookLengths } from '@/lib/reading/session-form';

export const mockSession: ReadingSession = {
  id: 'a'.repeat(24),
  bookId: 'b'.repeat(24),
  status: 'in_progress',
  progress: { unit: 'pages', value: 120 },
  startedOn: '2023-01-01',
  createdAt: '2023-01-01T10:00:00.000Z',
  updatedAt: '2023-01-01T10:00:00.000Z',
};

export const mockLengths: BookLengths = {
  pageCount: 300,
  chapterCount: 20,
};
