import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('joins conditional classes and lets later Tailwind utilities win', () => {
    const hidden = false as boolean;
    expect(cn('px-4 text-sm', hidden && 'hidden', 'px-6')).toBe('text-sm px-6');
  });
});
