import { describe, expect, it } from 'vitest';
import { readFormValues } from './read-form-values';

describe('readFormValues', () => {
  it('reads what the form shows, including text typed before hydration', () => {
    const form = document.createElement('form');
    form.innerHTML = `
      <input name="email" value="">
      <textarea name="note"></textarea>
      <select name="priority"><option value="low">Low</option><option value="high">High</option></select>
      <input type="radio" name="format" value="physical"><input type="radio" name="format" value="ebook">
      <input name="unrelated" value="ignored">`;
    (form.elements.namedItem('email') as HTMLInputElement).value = 'early@example.test';
    (form.elements.namedItem('note') as HTMLTextAreaElement).value = 'typed early';
    (form.elements.namedItem('priority') as HTMLSelectElement).value = 'high';
    (form.querySelector('input[value="ebook"]') as HTMLInputElement).checked = true;

    expect(
      readFormValues(form, {
        email: '',
        note: '',
        priority: 'low',
        format: 'physical',
        missing: 'kept',
      }),
    ).toEqual({
      email: 'early@example.test',
      note: 'typed early',
      priority: 'high',
      format: 'ebook',
      missing: 'kept',
    });
  });

  it('keeps the current radio value when none is checked', () => {
    const form = document.createElement('form');
    form.innerHTML = '<input type="radio" name="format" value="physical">';
    expect(readFormValues(form, { format: 'physical' })).toEqual({ format: 'physical' });
  });
});
