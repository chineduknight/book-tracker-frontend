import type { Route } from 'next';
import {
  BookOpen,
  Heart,
  House,
  Layers,
  LibraryBig,
  NotebookPen,
  Repeat,
  Tags,
  type LucideIcon,
} from 'lucide-react';

/**
 * The single source of truth for the app's five primary destinations. The phone bottom bar and the
 * tablet/desktop sidebar both render this list, so labels, order and routes cannot diverge.
 * Account settings are deliberately not a sixth tab: the header reserves a place for them.
 */
export interface Destination {
  href: Route;
  label: string;
  icon: LucideIcon;
  /** One sentence describing what the destination is for, reused by page headers and cards. */
  summary: string;
}

export const primaryNavigation = [
  {
    href: '/',
    label: 'Home',
    icon: House,
    summary: 'A calm overview of your library, recent reading and anything that needs attention.',
  },
  {
    href: '/library',
    label: 'Library',
    icon: LibraryBig,
    summary:
      'Your catalogue of books and physical copies, with categories, collections and a wishlist.',
  },
  {
    href: '/reading',
    label: 'Reading',
    icon: BookOpen,
    summary: 'What you are reading now: progress by page or chapter, reading sessions and rereads.',
  },
  {
    href: '/notes',
    label: 'Notes',
    icon: NotebookPen,
    summary: 'Chapter notes, quotes and highlights, gathered in one place and searchable.',
  },
  {
    href: '/lending',
    label: 'Lending',
    icon: Repeat,
    summary: 'Which copy is with whom, when it is due back, and everything that has been returned.',
  },
] as const satisfies readonly Destination[];

export type PrimaryHref = (typeof primaryNavigation)[number]['href'];

/** Library subsections. They live under /library rather than being primary tabs. */
export const librarySections = [
  {
    href: '/library/categories',
    label: 'Categories',
    icon: Tags,
    summary: 'Group books by subject using the default categories or ones you create.',
  },
  {
    href: '/library/collections',
    label: 'Collections',
    icon: Layers,
    summary: 'Hand-picked lists such as “Books for 2027”, in the order you choose.',
  },
  {
    href: '/library/wishlist',
    label: 'Wishlist',
    icon: Heart,
    summary: 'Books you would like to own, kept apart from the books you already have.',
  },
] as const satisfies readonly Destination[];

/**
 * Whether a primary destination is the current one. Home matches only `/`; every other destination
 * also matches its subpaths, so `/library/wishlist` keeps Library active.
 */
export function isDestinationActive(href: PrimaryHref, pathname: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function findDestination(href: PrimaryHref): Destination {
  const destination = primaryNavigation.find((item) => item.href === href);
  if (!destination) throw new Error(`Unknown primary destination: ${href}`);
  return destination;
}
