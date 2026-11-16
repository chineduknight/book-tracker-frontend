interface SectionHeaderProps {
  id: string;
  title: string;
  description?: string | undefined;
}

/** An `<h2>` for a section. Pass the id to the section's `aria-labelledby`. */
export function SectionHeader({ id, title, description }: SectionHeaderProps) {
  return (
    <div className="mb-4 flex flex-col gap-1">
      <h2 id={id} className="font-serif text-xl font-semibold text-ink">
        {title}
      </h2>
      {description ? <p className="max-w-prose text-sm text-ink-muted">{description}</p> : null}
    </div>
  );
}
