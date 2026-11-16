// Mock data for SessionEditor tests
import type { ReadingSession } from '@/lib/reading/types';
import type { BookLengths } from '@/lib/reading/session-form';

export const mockSession: ReadingSession = {
  id: 'mock-session-id',
  bookId: 'mock-book-id',
  status: 'in-progress',
  startedOn: '2023-01-01',
  // optional fields that SessionEditor may read; fill with defaults
  completedOn: undefined,
  // Add any additional required properties with placeholder values
  // (the type may include many fields; we provide a minimal subset)
} as ReadingSession;

export const mockLengths: BookLengths = {
  pages: 300,
  chapters: 20,
} as BookLengths;
