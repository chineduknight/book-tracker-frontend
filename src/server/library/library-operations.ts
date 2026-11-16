import 'server-only';
import type { GroupKind } from '@/lib/library/rules';
import type { LibraryOperation } from '../http/library-route';
import * as library from './library-api';
import { bookSearchQuery, duplicateCheckQuery } from './library-queries';
import {
  acquisitionSchema,
  createBookSchema,
  createCopySchema,
  createNamedSchema,
  createWishSchema,
  updateBookSchema,
  updateCopySchema,
  updateNamedSchema,
  updateWishSchema,
} from './library-schemas';

/*
 * Every browser-facing library operation, one per API endpoint. Route files under
 * src/app/api/library bind these to methods; nothing else can reach the API on the browser's behalf.
 */
function operation<Input, Result, IdName extends string = never>(
  definition: LibraryOperation<Input, Result, IdName>,
) {
  return definition;
}

export const searchBooks = operation({
  query: bookSearchQuery,
  run: (api, { input }) => library.listBooks(api, input),
});

export const checkDuplicateBooks = operation({
  query: duplicateCheckQuery,
  run: (api, { input }) => library.findDuplicateBooks(api, input),
});

export const createBook = operation({
  body: createBookSchema,
  successStatus: 201,
  run: (api, { input }) => library.createBook(api, input),
});

export const updateBook = operation({
  ids: ['bookId'],
  body: updateBookSchema,
  run: (api, { ids, input }) => library.updateBook(api, ids.bookId, input),
});

export const deleteBook = operation({
  ids: ['bookId'],
  run: (api, { ids }) => library.deleteBook(api, ids.bookId),
});

export const createCopy = operation({
  ids: ['bookId'],
  body: createCopySchema,
  successStatus: 201,
  run: (api, { ids, input }) => library.createCopy(api, ids.bookId, input),
});

export const updateCopy = operation({
  ids: ['copyId'],
  body: updateCopySchema,
  run: (api, { ids, input }) => library.updateCopy(api, ids.copyId, input),
});

export const deleteCopy = operation({
  ids: ['copyId'],
  run: (api, { ids }) => library.deleteCopy(api, ids.copyId),
});

export const createLocation = operation({
  body: createNamedSchema,
  successStatus: 201,
  run: (api, { input }) => library.createLocation(api, input),
});

export const updateLocation = operation({
  ids: ['locationId'],
  body: updateNamedSchema,
  run: (api, { ids, input }) => library.updateLocation(api, ids.locationId, input),
});

export function groupOperations(kind: GroupKind) {
  return {
    create: operation({
      body: createNamedSchema,
      successStatus: 201,
      run: (api, { input }) => library.createGroup(api, kind, input),
    }),
    update: operation({
      ids: ['groupId'],
      body: updateNamedSchema,
      run: (api, { ids, input }) => library.updateGroup(api, kind, ids.groupId, input),
    }),
    remove: operation({
      ids: ['groupId'],
      run: (api, { ids }) => library.deleteGroup(api, kind, ids.groupId),
    }),
    addBook: operation({
      ids: ['groupId', 'bookId'],
      run: (api, { ids }) => library.addBookToGroup(api, kind, ids.groupId, ids.bookId),
    }),
    removeBook: operation({
      ids: ['groupId', 'bookId'],
      run: (api, { ids }) => library.removeBookFromGroup(api, kind, ids.groupId, ids.bookId),
    }),
  };
}

export const createWish = operation({
  body: createWishSchema,
  successStatus: 201,
  run: (api, { input }) => library.createWish(api, input),
});

export const updateWish = operation({
  ids: ['itemId'],
  body: updateWishSchema,
  run: (api, { ids, input }) => library.updateWish(api, ids.itemId, input),
});

export const deleteWish = operation({
  ids: ['itemId'],
  run: (api, { ids }) => library.deleteWish(api, ids.itemId),
});

export const acquireWish = operation({
  ids: ['itemId'],
  body: acquisitionSchema,
  run: (api, { ids, input }) => library.acquireWish(api, ids.itemId, input.bookId),
});
