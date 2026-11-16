/**
 * The values a form shows, read from its elements by field name. Forms adopt these on submit:
 * text typed before React hydrated is visible in the DOM but absent from React state, and would
 * otherwise be validated as empty and then wiped by the next render.
 */
export function readFormValues<Values extends { [Key in keyof Values]: string }>(
  form: HTMLFormElement,
  current: Values,
): Values {
  const next: Record<string, string> = { ...current };
  for (const name of Object.keys(current as object)) {
    const field = form.elements.namedItem(name);
    if (field instanceof RadioNodeList) {
      if (field.value !== '') next[name] = field.value;
    } else if (
      field instanceof HTMLInputElement ||
      field instanceof HTMLTextAreaElement ||
      field instanceof HTMLSelectElement
    ) {
      next[name] = field.value;
    }
  }
  return next as Values;
}
