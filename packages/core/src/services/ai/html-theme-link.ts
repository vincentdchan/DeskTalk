/**
 * Returns a `<link>` tag that loads the DeskTalk theme + base stylesheet from
 * the core server's `/api/ui/desktalk-theme.css` endpoint.
 *
 * Query parameters encode the user's current accent color and theme mode so
 * the browser can cache each configuration independently.
 */
export function createThemeLinkTag(accentColor: string, theme: string): string {
  const params = new URLSearchParams({ accent: accentColor, theme });
  return `<link rel="stylesheet" href="/api/ui/desktalk-theme.css?${params.toString()}" data-dt-theme>`;
}
