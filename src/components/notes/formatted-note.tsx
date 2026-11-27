import type { ReactNode } from 'react';
import { ExternalLink } from '@/components/library/external-link';
import { parseNote, type Block, type Inline } from '@/lib/notes/format';

/*
 * Renders a note's formatting as React elements built from the parser's data, never from HTML:
 * there is no dangerouslySetInnerHTML, so markup, scripts and images in a note stay text, and only
 * web addresses become links (opened in a new tab without referrer).
 */

function renderInlines(inlines: Inline[]): ReactNode[] {
  return inlines.map((inline, index) => {
    switch (inline.type) {
      case 'text':
        return inline.text;
      case 'break':
        return <br key={index} />;
      case 'bold':
        return <strong key={index}>{renderInlines(inline.children)}</strong>;
      case 'italic':
        return <em key={index}>{renderInlines(inline.children)}</em>;
      case 'strike':
        return <s key={index}>{renderInlines(inline.children)}</s>;
      case 'code':
        return (
          <code key={index} className="rounded bg-surface-muted px-1 py-0.5 font-mono text-[0.9em]">
            {inline.text}
          </code>
        );
      case 'link':
        return (
          <ExternalLink key={index} href={inline.href}>
            {renderInlines(inline.children)}
          </ExternalLink>
        );
    }
  });
}

const HEADING_CLASS = { 1: 'text-xl', 2: 'text-lg', 3: 'text-base' } as const;

function renderBlock(block: Block, index: number): ReactNode {
  switch (block.type) {
    case 'paragraph':
      return <p key={index}>{renderInlines(block.content)}</p>;
    case 'heading':
      // Styled, not an <h*>: a reader's note must not reshape the page's heading outline.
      return (
        <p key={index} className={`font-serif font-semibold ${HEADING_CLASS[block.level]}`}>
          {renderInlines(block.content)}
        </p>
      );
    case 'list': {
      const items = block.items.map((item, itemIndex) => (
        <li key={itemIndex}>{renderInlines(item)}</li>
      ));
      return block.ordered ? (
        <ol key={index} start={block.start} className="list-decimal pl-6">
          {items}
        </ol>
      ) : (
        <ul key={index} className="list-disc pl-6">
          {items}
        </ul>
      );
    }
    case 'quote':
      return (
        <blockquote
          key={index}
          className="flex flex-col gap-2 border-l-4 border-line-strong pl-3 text-ink-muted"
        >
          {block.blocks.map(renderBlock)}
        </blockquote>
      );
    case 'code':
      return (
        <pre
          key={index}
          className="rounded-lg bg-surface-muted p-3 font-mono text-sm whitespace-pre-wrap break-words"
        >
          <code>{block.text}</code>
        </pre>
      );
  }
}

/** A note or commentary with its formatting applied. */
export function FormattedNote({ source }: { source: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-3 break-words text-ink">
      {parseNote(source).map(renderBlock)}
    </div>
  );
}
