/**
 * Full-page navigations, used after the session changes so the next page is rendered by the server
 * with the new cookie and nothing private survives in the client-side router cache.
 */
export function navigateTo(path: string): void {
  window.location.assign(path);
}

export function replaceWith(path: string): void {
  window.location.replace(path);
}
