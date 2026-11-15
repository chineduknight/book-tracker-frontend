/** Every page in FE #15 and the heading it must show. */
export const pages = [
  { path: '/', heading: 'Welcome to your library', title: 'Home · Book Tracker', nav: 'Home' },
  { path: '/library', heading: 'Library', title: 'Library · Book Tracker', nav: 'Library' },
  {
    path: '/library/categories',
    heading: 'Categories',
    title: 'Categories · Book Tracker',
    nav: 'Library',
  },
  {
    path: '/library/collections',
    heading: 'Collections',
    title: 'Collections · Book Tracker',
    nav: 'Library',
  },
  {
    path: '/library/wishlist',
    heading: 'Wishlist',
    title: 'Wishlist · Book Tracker',
    nav: 'Library',
  },
  { path: '/reading', heading: 'Reading', title: 'Reading · Book Tracker', nav: 'Reading' },
  { path: '/notes', heading: 'Notes', title: 'Notes · Book Tracker', nav: 'Notes' },
  { path: '/lending', heading: 'Lending', title: 'Lending · Book Tracker', nav: 'Lending' },
] as const;

export const navLabels = ['Home', 'Library', 'Reading', 'Notes', 'Lending'];
