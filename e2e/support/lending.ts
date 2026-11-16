import type { Page } from '@playwright/test';
import { libraryApi, uniqueWord } from './reader';

export interface SeededLending {
  bookId: string;
  bookTitle: string;
  copyIds: string[];
  overdueLoanId: string;
  activeLoanId: string;
  returnedLoanId: string;
  borrowers: { overdue: string; active: string; returned: string };
}

/** A physical book with three copies: one overdue loan, one open loan and one returned loan. */
export async function seedLending(page: Page, origin: string): Promise<SeededLending> {
  const word = uniqueWord('ld');
  const bookTitle = `Middlemarch ${word}`;
  const book = await libraryApi<{ id: string }>(page, origin, 'POST', '/api/library/books', {
    title: bookTitle,
    authors: ['George Eliot'],
    format: 'physical',
  });
  const copyIds: string[] = [];
  for (const label of ['Signed hardback', 'Paperback', 'Reading copy']) {
    const copy = await libraryApi<{ id: string }>(
      page,
      origin,
      'POST',
      `/api/library/books/${book.id}/copies`,
      { label },
    );
    copyIds.push(copy.id);
  }
  const borrowers = {
    overdue: `Dorothea ${word}`,
    active: `Will ${word}`,
    returned: `Mary ${word}`,
  };
  const lend = (copyId: string, body: Record<string, string>) =>
    libraryApi<{ id: string }>(page, origin, 'POST', `/api/lending/copies/${copyId}/loans`, body);
  const overdue = await lend(copyIds[0]!, {
    borrowerName: borrowers.overdue,
    borrowerContact: 'dorothea@example.test',
    lentOn: '2026-01-02',
    dueOn: '2026-01-12',
    note: 'Lent with the dust jacket.\nAsk about chapter 20.',
  });
  const active = await lend(copyIds[1]!, { borrowerName: borrowers.active, lentOn: '2026-11-01' });
  const returned = await lend(copyIds[2]!, {
    borrowerName: borrowers.returned,
    lentOn: '2026-02-01',
    dueOn: '2026-02-20',
  });
  await libraryApi(page, origin, 'PUT', `/api/lending/loans/${returned.id}/return`, {
    returnedOn: '2026-02-18',
  });
  return {
    bookId: book.id,
    bookTitle,
    copyIds,
    overdueLoanId: overdue.id,
    activeLoanId: active.id,
    returnedLoanId: returned.id,
    borrowers,
  };
}

export function lendingPaths(seeded: SeededLending): string[] {
  return [
    '/',
    '/lending',
    '/lending?status=overdue',
    '/lending?status=returned&sort=oldest',
    '/lending?status=all',
    '/lending?page=999',
    '/lending/new',
    `/lending/new?bookId=${seeded.bookId}`,
    `/lending/new?copyId=${seeded.copyIds[0]}`,
    `/lending/${seeded.overdueLoanId}`,
    `/lending/${seeded.returnedLoanId}`,
    `/lending/copies/${seeded.copyIds[2]}`,
    `/library/books/${seeded.bookId}`,
  ];
}
