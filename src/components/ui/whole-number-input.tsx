'use client';

import type { ComponentProps } from 'react';
import { Input } from './input';

/**
 * Removes every character that is not a digit, keeping the caret where the reader left it. Runs on
 * each input event, so it covers typing, pasting, autofill and dictation alike.
 */
export function keepDigits(input: HTMLInputElement): void {
  const { value } = input;
  const digits = value.replace(/\D+/g, '');
  if (digits === value) return;
  const caret = input.selectionStart ?? value.length;
  const digitsBeforeCaret = value.slice(0, caret).replace(/\D+/g, '').length;
  input.value = digits;
  input.setSelectionRange(digitsBeforeCaret, digitsBeforeCaret);
}

type WholeNumberInputProps = Omit<
  ComponentProps<typeof Input>,
  'type' | 'inputMode' | 'pattern' | 'maxLength'
> & {
  /** The largest value the field accepts; it also caps how many digits can be entered. */
  max: number;
};

/**
 * A field that accepts whole numbers only: the numeric keypad on phones, and anything that is not
 * a digit is dropped as it arrives. It stays a text field (not `type="number"`), which would allow
 * "e", signs and decimals, change on scroll, and report invalid input as an empty value. Range
 * checks stay with the form's validation.
 */
export function WholeNumberInput({ max, onInput, ...props }: WholeNumberInputProps) {
  return (
    <Input
      {...props}
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      maxLength={String(max).length}
      onInput={(event) => {
        keepDigits(event.currentTarget);
        onInput?.(event);
      }}
    />
  );
}
