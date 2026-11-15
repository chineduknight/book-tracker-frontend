import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrimaryNavigation } from './primary-navigation';

const navigation = vi.hoisted(() => ({ pathname: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname }));

function renderAt(pathname: string) {
  navigation.pathname = pathname;
  render(<PrimaryNavigation />);
  return screen.getByRole('navigation', { name: 'Primary' });
}

describe('PrimaryNavigation', () => {
  beforeEach(() => {
    navigation.pathname = '/';
  });

  it('renders five labelled links in order', () => {
    const nav = renderAt('/');
    const links = within(nav).getAllByRole('link');
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Home', '/'],
      ['Library', '/library'],
      ['Reading', '/reading'],
      ['Notes', '/notes'],
      ['Lending', '/lending'],
    ]);
  });

  it('marks exactly the current destination with aria-current="page"', () => {
    const nav = renderAt('/reading');
    const current = within(nav)
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAccessibleName('Reading');
  });

  it('keeps Library current on a Library subsection', () => {
    const nav = renderAt('/library/collections');
    expect(within(nav).getByRole('link', { name: 'Library' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });

  it('hides icons from assistive technology so labels carry the meaning', () => {
    const nav = renderAt('/');
    for (const svg of nav.querySelectorAll('svg')) {
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    }
  });
});
