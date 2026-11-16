import 'server-only';
import type { ApiClient } from '@/lib/api/client';
import type { Activity } from '@/lib/dashboard/types';
import { getWish } from '../library/library-api';
import { lookUpBooks, mapBounded, orNullIfMissing } from '../reading/book-lookup';
import { getRecentActivity } from './dashboard-api';

export interface ActivityItem {
  activity: Activity;
  /** Where the item can be opened, or null when the record is no longer visible. */
  href: string | null;
  /** A safe subject: a book or wish title. Never a borrower, contact or note text. */
  subject: string | null;
  /** True when the related book is gone; the item then says so instead of inventing a title. */
  bookGone: boolean;
}

function hrefOf(activity: Activity): string {
  switch (activity.type) {
    case 'book_added':
      return `/library/books/${activity.resourceId}`;
    case 'reading_session_recorded':
      return `/reading/${activity.resourceId}`;
    case 'note_added':
    case 'highlight_added':
      return `/notes/${activity.resourceId}`;
    case 'wishlist_item_added':
      return `/library/wishlist/${activity.resourceId}`;
    case 'loan_recorded':
      return `/lending/${activity.resourceId}`;
  }
}

/**
 * Recent activity with safe labels, resolved in a bounded number of requests: one per distinct book
 * and one per wish (at most 10 of each, four at a time). A 404 means the record is gone; a loan
 * stays openable even then, because loans outlive their books.
 */
export async function loadRecentActivity(api: ApiClient): Promise<ActivityItem[]> {
  const activities = await getRecentActivity(api, 10);
  const wishIds = activities
    .filter((activity) => activity.type === 'wishlist_item_added')
    .map((activity) => activity.resourceId);
  const [books, wishes] = await Promise.all([
    lookUpBooks(
      api,
      activities.flatMap((activity) => (activity.bookId ? [activity.bookId] : [])),
    ),
    mapBounded(wishIds, (wishId) => orNullIfMissing(getWish(api, wishId))),
  ]);
  const wishById = new Map(wishIds.map((id, index) => [id, wishes[index] ?? null]));

  return activities.map((activity) => {
    if (activity.type === 'wishlist_item_added') {
      const wish = wishById.get(activity.resourceId) ?? null;
      return {
        activity,
        href: wish ? hrefOf(activity) : null,
        subject: wish?.title ?? null,
        bookGone: false,
      };
    }
    const book = activity.bookId ? (books.get(activity.bookId) ?? null) : null;
    const bookGone = activity.bookId !== null && book === null;
    // A loan detail stays reachable after its book is deleted; other records are hidden with it.
    const reachable = !bookGone || activity.type === 'loan_recorded';
    return {
      activity,
      href: reachable ? hrefOf(activity) : null,
      subject: book?.title ?? null,
      bookGone,
    };
  });
}
