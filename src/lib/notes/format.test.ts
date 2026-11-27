import { describe, expect, it } from 'vitest';
import { parseInline, parseNote, plainTextOf, type Inline } from './format';

const text = (value: string): Inline => ({ type: 'text', text: value });

describe('parseInline', () => {
  it('reads WhatsApp and Markdown marks, with *single* asterisks as bold', () => {
    expect(parseInline('a *bold* b')).toEqual([
      text('a '),
      { type: 'bold', children: [text('bold')] },
      text(' b'),
    ]);
    expect(parseInline('**also bold**')).toEqual([{ type: 'bold', children: [text('also bold')] }]);
    expect(parseInline('_italic_ ~gone~ ~~gone too~~')).toEqual([
      { type: 'italic', children: [text('italic')] },
      text(' '),
      { type: 'strike', children: [text('gone')] },
      text(' '),
      { type: 'strike', children: [text('gone too')] },
    ]);
    expect(parseInline('```mono``` and `code`')).toEqual([
      { type: 'code', text: 'mono' },
      text(' and '),
      { type: 'code', text: 'code' },
    ]);
  });

  it('nests marks, but never formats inside code', () => {
    expect(parseInline('*bold _and italic_*')).toEqual([
      {
        type: 'bold',
        children: [text('bold '), { type: 'italic', children: [text('and italic')] }],
      },
    ]);
    expect(parseInline('`*not bold*`')).toEqual([{ type: 'code', text: '*not bold*' }]);
  });

  it('leaves marks inside words, maths, lone marks and escaped marks as typed', () => {
    for (const literal of [
      'snake_case_name',
      '2*3*4',
      'a * b * c',
      'price ~5 or ~6',
      '*unclosed',
      '\\*not bold\\*',
    ]) {
      const parsed = parseInline(literal);
      expect(parsed.every((inline) => inline.type === 'text')).toBe(true);
    }
    expect(plainTextOf('\\*kept\\*')).toBe('*kept*');
  });

  it('links only web addresses', () => {
    expect(parseInline('see [the site](https://example.com/a?b=1)')).toEqual([
      text('see '),
      { type: 'link', href: 'https://example.com/a?b=1', children: [text('the site')] },
    ]);
    expect(parseInline('at https://example.com/page.')).toEqual([
      text('at '),
      {
        type: 'link',
        href: 'https://example.com/page',
        children: [text('https://example.com/page')],
      },
      text('.'),
    ]);
    for (const unsafe of [
      '[click](javascript:alert(1))',
      '[x](data:text/html,<script>alert(1)</script>)',
      '![image](https://example.com/x.png)',
    ]) {
      const parsed = parseInline(unsafe);
      expect(
        parsed.some((inline) => inline.type === 'link' && !inline.href.startsWith('http')),
      ).toBe(false);
    }
  });

  it('keeps image syntax as typed, never a link or an image', () => {
    expect(parseInline('![cover](https://tracker.example/p.png)')).toEqual([
      text('![cover](https://tracker.example/p.png)'),
    ]);
  });

  it('keeps HTML as the characters it is', () => {
    expect(parseInline('<script>alert(1)</script><img src=x onerror=alert(1)>')).toEqual([
      text('<script>alert(1)</script><img src=x onerror=alert(1)>'),
    ]);
  });
});

describe('parseNote', () => {
  it('reads headings, lists, quotes, code fences and paragraphs with line breaks', () => {
    const blocks = parseNote(
      [
        '# Ardent souls',
        '',
        'Line one',
        'line *two*',
        '',
        '- Casaubon',
        '* Ladislaw',
        '',
        '3. third',
        '4. fourth',
        '',
        '> quoted _words_',
        '',
        '```',
        '*kept* as code',
        '```',
      ].join('\n'),
    );
    expect(blocks.map((block) => block.type)).toEqual([
      'heading',
      'paragraph',
      'list',
      'list',
      'quote',
      'code',
    ]);
    expect(blocks[1]).toEqual({
      type: 'paragraph',
      content: [
        text('Line one'),
        { type: 'break' },
        text('line '),
        { type: 'bold', children: [text('two')] },
      ],
    });
    expect(blocks[2]).toMatchObject({
      ordered: false,
      items: [[text('Casaubon')], [text('Ladislaw')]],
    });
    expect(blocks[3]).toMatchObject({ ordered: true, start: 3 });
    expect(blocks[5]).toEqual({ type: 'code', text: '*kept* as code' });
  });

  it('treats an unclosed fence as ordinary text', () => {
    expect(parseNote('```\nno end')).toEqual([
      { type: 'paragraph', content: [text('```'), { type: 'break' }, text('no end')] },
    ]);
  });
});

describe('plainTextOf', () => {
  it('drops the marks for previews', () => {
    expect(plainTextOf('# Title\n\n*bold* and _italic_\n- one\n- two')).toBe(
      'Title\nbold and italic\n• one\n• two',
    );
  });
});
