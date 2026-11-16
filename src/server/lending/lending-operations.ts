import 'server-only';
import type { LibraryOperation } from '../http/library-route';
import * as lending from './lending-api';
import { createLoanSchema, returnLoanSchema, updateLoanSchema } from './lending-schemas';

/*
 * Every browser-facing lending operation, one per API endpoint, on the hardened library pipeline
 * (exact Origin, 24-hex ids, strict 32 KiB JSON bodies, the reader's session, no-store). Pages
 * read loans on the server; the browser only writes and checks one copy's status.
 */
function operation<Input, Result, IdName extends string = never>(
  definition: LibraryOperation<Input, Result, IdName>,
) {
  return definition;
}

const noParameters = (params: URLSearchParams) =>
  params.size === 0
    ? ({ ok: true, value: undefined } as const)
    : ({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'This request takes no parameters.' },
      } as const);

export const createLoan = operation({
  ids: ['copyId'],
  body: createLoanSchema,
  successStatus: 201,
  run: (api, { ids, input }) => lending.createLoan(api, ids.copyId, input),
});

export const getCopyLoanOverview = operation({
  ids: ['copyId'],
  query: noParameters,
  run: (api, { ids }) => lending.getCopyLoanOverview(api, ids.copyId),
});

export const updateLoan = operation({
  ids: ['loanId'],
  body: updateLoanSchema,
  run: (api, { ids, input }) => lending.updateLoan(api, ids.loanId, input),
});

export const returnLoan = operation({
  ids: ['loanId'],
  body: returnLoanSchema,
  run: (api, { ids, input }) => lending.returnLoan(api, ids.loanId, input.returnedOn),
});
