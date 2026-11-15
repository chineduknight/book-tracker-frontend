import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LibraryBig } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { Button, ButtonLink } from './button';
import { LinkCard } from './card';
import { EmptyState } from './empty-state';
import { InlineError } from './inline-error';
import { Input } from './input';
import { Skeleton } from './skeleton';

describe('Button', () => {
  it('is a real button that does not submit forms by default', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Try again</Button>);
    const button = screen.getByRole('button', { name: 'Try again' });

    expect(button).toHaveAttribute('type', 'button');
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('cannot be activated when disabled', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Save
      </Button>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders navigation as a link, not a button', () => {
    render(<ButtonLink href="/library">Go to the Library</ButtonLink>);
    expect(screen.getByRole('link', { name: 'Go to the Library' })).toHaveAttribute(
      'href',
      '/library',
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('EmptyState', () => {
  it('shows a heading, description and a real link', () => {
    render(
      <EmptyState
        icon={LibraryBig}
        title="Nothing here yet"
        description="Books arrive later."
        action={{ href: '/library', label: 'Go to the Library' }}
      />,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Nothing here yet' })).toBeInTheDocument();
    expect(screen.getByText('Books arrive later.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to the Library' })).toHaveAttribute(
      'href',
      '/library',
    );
  });

  it('offers no control when there is no destination', () => {
    render(<EmptyState title="Nothing here yet" description="Books arrive later." />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('InlineError', () => {
  it('is announced as an alert and shows the request reference', () => {
    render(
      <InlineError title="Could not load books" requestId="req-123">
        Try again in a moment.
      </InlineError>,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Could not load books');
    expect(alert).toHaveTextContent('Try again in a moment.');
    expect(alert).toHaveTextContent('Reference: req-123');
  });
});

describe('Input', () => {
  it('is labelled and links its hint and error', () => {
    render(<Input label="Title" hint="As printed on the cover" error="Title is required" />);
    const input = screen.getByRole('textbox', { name: 'Title' });

    expect(input).toHaveAccessibleDescription('As printed on the cover Title is required');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('is not marked invalid without an error', () => {
    render(<Input label="Author" />);
    const input = screen.getByRole('textbox', { name: 'Author' });
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).not.toHaveAttribute('aria-describedby');
  });
});

describe('Skeleton', () => {
  it('is hidden from assistive technology', () => {
    const { container } = render(<Skeleton className="h-4 w-32" />);
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('LinkCard', () => {
  it('names its link by the title alone and shows an honest status', () => {
    render(
      <LinkCard
        href="/reading"
        title="Reading"
        description="Progress and sessions."
        icon={LibraryBig}
        status="Coming soon"
      />,
    );
    expect(screen.getByRole('link', { name: 'Reading' })).toHaveAttribute('href', '/reading');
    expect(screen.getByRole('heading', { level: 3, name: 'Reading' })).toBeInTheDocument();
    expect(screen.getByText('Coming soon')).toBeInTheDocument();
  });
});
