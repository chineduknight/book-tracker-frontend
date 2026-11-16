import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string | undefined;
  /** Rendered above the title, e.g. a breadcrumb back to the parent section. */
  before?: ReactNode;
}

/** The page's single `<h1>` and its introduction. */
export function PageHeader({ title, description, before }: PageHeaderProps) {
  return (
    <header className="mb-8 flex flex-col gap-2">
      {before}
      <h1 className="font-serif text-3xl break-words font-semibold tracking-tight text-ink sm:text-4xl">
        {title}
      </h1>
      {description ? <p className="max-w-prose text-base text-ink-muted">{description}</p> : null}
    </header>
  );
}
