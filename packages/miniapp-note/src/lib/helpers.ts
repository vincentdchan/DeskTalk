/**
 * Utility functions for the Note MiniApp backend.
 */

/** Convert a title to a URL-safe slug, max 64 chars. */
export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'untitled'
  );
}

/** Extract a plain-text preview from Markdown body, stripping formatting. */
export function preview(body: string, maxLen = 100): string {
  const text = body
    .replace(/^#+\s+/gm, '')
    .replace(/[*_`~\[\]()>]/g, '')
    .trim();
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
}
