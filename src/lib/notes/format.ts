/**
 * A small, safe formatter for reader-written notes: Markdown basics plus WhatsApp-style marks.
 * It produces a plain data structure (never HTML), which the renderer turns into React elements,
 * so raw HTML, scripts, images and non-web links in a note stay the characters they are.
 *
 * Inline: *bold* and **bold** (WhatsApp, owner decision 2026-11-27), __bold__, _italic_,
 * ~strike~ and ~~strike~~, `code`, ```mono```, [text](https://…) and bare https:// addresses.
 * Blocks: paragraphs (line breaks kept), # headings, - and 1. lists, > quotes, ``` code fences.
 * Marks count only at word boundaries, so snake_case_names and 2*3*4 stay as typed; a backslash
 * keeps the next mark literal (\*).
 */

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'bold' | 'italic' | 'strike'; children: Inline[] }
  | { type: 'code'; text: string }
  | { type: 'link'; href: string; children: Inline[] }
  | { type: 'break' };

export type Block =
  | { type: 'paragraph'; content: Inline[] }
  | { type: 'heading'; level: 1 | 2 | 3; content: Inline[] }
  | { type: 'list'; ordered: boolean; start: number; items: Inline[][] }
  | { type: 'quote'; blocks: Block[] }
  | { type: 'code'; text: string };

const FENCE = /^ {0,3}```[\w+-]*\s*$/;
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const QUOTE = /^ {0,3}>\s?(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*(\d{1,9})[.)]\s+(.*)$/;

export function parseNote(source: string): Block[] {
  return parseBlocks(source.replace(/\r\n?/g, '\n').split('\n'));
}

function parseBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length > 0) blocks.push({ type: 'paragraph', content: inlineLines(paragraph) });
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === '') {
      flush();
      continue;
    }
    if (FENCE.test(line)) {
      const end = lines.findIndex((candidate, j) => j > i && /^ {0,3}```\s*$/.test(candidate));
      if (end !== -1) {
        flush();
        blocks.push({ type: 'code', text: lines.slice(i + 1, end).join('\n') });
        i = end;
        continue;
      }
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      const level = Math.min(heading[1]!.length, 3) as 1 | 2 | 3;
      blocks.push({ type: 'heading', level, content: parseInline(heading[2]!) });
      continue;
    }
    if (QUOTE.test(line)) {
      flush();
      const quoted: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i]!)) quoted.push(QUOTE.exec(lines[i++]!)![1]!);
      i -= 1;
      blocks.push({ type: 'quote', blocks: parseBlocks(quoted) });
      continue;
    }
    const listPattern = BULLET.test(line) ? BULLET : NUMBERED.test(line) ? NUMBERED : null;
    if (listPattern) {
      flush();
      const ordered = listPattern === NUMBERED;
      const items: Inline[][] = [];
      const start = ordered ? Number(NUMBERED.exec(line)![1]) : 1;
      while (i < lines.length && listPattern.test(lines[i]!)) {
        const match = listPattern.exec(lines[i++]!)!;
        items.push(parseInline(ordered ? match[2]! : match[1]!));
      }
      i -= 1;
      blocks.push({ type: 'list', ordered, start, items });
      continue;
    }
    paragraph.push(line);
  }
  flush();
  return blocks;
}

function inlineLines(lines: string[]): Inline[] {
  return lines.flatMap((line, index) =>
    index === 0 ? parseInline(line) : [{ type: 'break' } as const, ...parseInline(line)],
  );
}

const MARKS: [string, 'bold' | 'italic' | 'strike'][] = [
  ['**', 'bold'],
  ['__', 'bold'],
  ['~~', 'strike'],
  ['*', 'bold'],
  ['_', 'italic'],
  ['~', 'strike'],
];

const isWordChar = (char: string | undefined) => char !== undefined && /[\p{L}\p{N}]/u.test(char);
const isSpace = (char: string | undefined) => char === undefined || /\s/.test(char);

/** Parses one line of text. */
export function parseInline(text: string, allowLinks = true): Inline[] {
  const out: Inline[] = [];
  let plain = '';
  const pushText = () => {
    if (plain) out.push({ type: 'text', text: plain });
    plain = '';
  };

  let i = 0;
  while (i < text.length) {
    const char = text[i]!;

    // A backslash keeps the next punctuation mark literal.
    if (char === '\\' && /[\\`*_~[\]()#>-]/.test(text[i + 1] ?? '')) {
      plain += text[i + 1];
      i += 2;
      continue;
    }

    // Code: ```mono``` or `code`. Nothing inside is formatted.
    if (char === '`') {
      const ticks = text.startsWith('```', i) ? '```' : '`';
      const end = text.indexOf(ticks, i + ticks.length);
      if (end > i + ticks.length) {
        pushText();
        out.push({ type: 'code', text: text.slice(i + ticks.length, end) });
        i = end + ticks.length;
        continue;
      }
    }

    // Image syntax is not supported: ![alt](address) stays exactly as typed, never a link.
    if (char === '!' && text[i + 1] === '[') {
      const image = /^!\[[^\]\n]*\]\([^)\n]*\)/.exec(text.slice(i));
      if (image) {
        plain += image[0];
        i += image[0].length;
        continue;
      }
    }

    if (allowLinks) {
      // [text](https://…) — only web addresses become links.
      if (char === '[') {
        const match = /^\[([^\]\n]+)\]\(([^)\s]+)\)/.exec(text.slice(i));
        if (match && isWebAddress(match[2]!)) {
          pushText();
          out.push({ type: 'link', href: match[2]!, children: parseInline(match[1]!, false) });
          i += match[0].length;
          continue;
        }
      }
      // A bare https:// or http:// address, without trailing punctuation.
      if ((char === 'h' || char === 'H') && !isWordChar(text[i - 1])) {
        const match = /^https?:\/\/[^\s<>]+/i.exec(text.slice(i));
        if (match) {
          const href = match[0].replace(/[.,;:!?)\]'"]+$/, '');
          if (isWebAddress(href)) {
            pushText();
            out.push({ type: 'link', href, children: [{ type: 'text', text: href }] });
            i += href.length;
            continue;
          }
        }
      }
    }

    // Emphasis: an opening mark after a non-word character and before a non-space, closed by the
    // same mark after a non-space and before a non-word character, on the same line.
    const mark = MARKS.find(([marker]) => text.startsWith(marker, i));
    if (mark && !isWordChar(text[i - 1]) && !isSpace(text[i + mark[0].length])) {
      const [marker, type] = mark;
      const close = findClosing(text, marker, i + marker.length);
      if (close !== -1) {
        pushText();
        out.push({
          type,
          children: parseInline(text.slice(i + marker.length, close), allowLinks),
        });
        i = close + marker.length;
        continue;
      }
    }

    plain += char;
    i += 1;
  }
  pushText();
  return out;
}

function findClosing(text: string, marker: string, from: number): number {
  for (let j = from; j < text.length; j++) {
    if (text[j] === '\\') {
      j += 1;
      continue;
    }
    if (text[j] === '`') {
      const end = text.indexOf('`', j + 1);
      if (end !== -1) j = end;
      continue;
    }
    if (
      text.startsWith(marker, j) &&
      !isSpace(text[j - 1]) &&
      !isWordChar(text[j + marker.length]) &&
      // "**" must not be read as the end of a single "*" (and so on).
      text[j + marker.length] !== marker[0] &&
      text[j - 1] !== marker[0]
    ) {
      return j;
    }
  }
  return -1;
}

function isWebAddress(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname.length > 0;
  } catch {
    return false;
  }
}

/** The words of a note without its formatting marks, for short previews in lists. */
export function plainTextOf(source: string): string {
  const inlineText = (inlines: Inline[]): string =>
    inlines
      .map((inline) =>
        inline.type === 'text' || inline.type === 'code'
          ? inline.text
          : inline.type === 'break'
            ? '\n'
            : inlineText(inline.children),
      )
      .join('');
  const blockText = (block: Block): string => {
    switch (block.type) {
      case 'paragraph':
      case 'heading':
        return inlineText(block.content);
      case 'list':
        return block.items.map((item) => `• ${inlineText(item)}`).join('\n');
      case 'quote':
        return block.blocks.map(blockText).join('\n');
      case 'code':
        return block.text;
    }
  };
  return parseNote(source).map(blockText).join('\n');
}
