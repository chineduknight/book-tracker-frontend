/** Every page in FE #15 and the heading it must show. */
export const pages = [
  { path: '/', heading: 'Welcome to your library', title: 'Home · Avuneri', nav: 'Home' },
  { path: '/library', heading: 'Library', title: 'Library · Avuneri', nav: 'Library' },
  {
    path: '/library/categories',
    heading: 'Categories',
    title: 'Categories · Avuneri',
    nav: 'Library',
  },
  {
    path: '/library/collections',
    heading: 'Collections',
    title: 'Collections · Avuneri',
    nav: 'Library',
  },
  {
    path: '/library/wishlist',
    heading: 'Wishlist',
    title: 'Wishlist · Avuneri',
    nav: 'Library',
  },
  { path: '/reading', heading: 'Reading', title: 'Reading · Avuneri', nav: 'Reading' },
  { path: '/notes', heading: 'Notes', title: 'Notes · Avuneri', nav: 'Notes' },
  { path: '/lending', heading: 'Lending', title: 'Lending · Avuneri', nav: 'Lending' },
] as const;

export const navLabels = ['Home', 'Library', 'Reading', 'Notes', 'Lending'];

export const publicPages = [
  { path: '/login', heading: 'Sign in', title: 'Sign in · Avuneri' },
  { path: '/register', heading: 'Create your account', title: 'Create an account · Avuneri' },
] as const;
