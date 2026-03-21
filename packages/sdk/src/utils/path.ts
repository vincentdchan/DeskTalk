/**
 * Path utilities for simplifying and displaying file paths.
 *
 * These utilities help convert long absolute paths into shorter,
 * user-friendly representations using known path prefixes like
 * <dt-home>, <dt-data>, and ~ for home directories.
 */

/**
 * Replace a prefix of a path with a shorter alias.
 */
function replacePrefix(path: string, prefixLength: number, replacement: string): string {
  const remainder = path.slice(prefixLength);
  if (!remainder || remainder === '/' || remainder === '\\') {
    return replacement;
  }

  if (remainder.startsWith('/') || remainder.startsWith('\\')) {
    return `${replacement}${remainder}`;
  }

  return `${replacement}/${remainder}`;
}

/**
 * Shorten DeskTalk home directory paths to <dt-home> alias.
 * Matches patterns like /path/to/home/username or C:\path\to\home\username
 */
function shortenDeskTalkHomePath(path: string): string | null {
  const match = path.match(/^(.*[\\/])home[\\/][^\\/]+(?=([\\/]|$))/i);
  if (!match || typeof match[0] !== 'string') {
    return null;
  }

  return replacePrefix(path, match[0].length, '<dt-home>');
}

/**
 * Shorten DeskTalk data directory paths to <dt-data> alias.
 * Matches patterns ending with /home, /miniapps, or /ai-sessions
 */
function shortenDeskTalkDataPath(path: string): string | null {
  const match = path.match(/^(.*[\\/])(?=(home|miniapps|ai-sessions)([\\/]|$))/i);
  if (!match || typeof match[1] !== 'string') {
    return null;
  }

  return replacePrefix(path, match[1].length, '<dt-data>');
}

/**
 * Shorten user home directory paths to ~ alias.
 * Matches patterns like /Users/username or /home/username or C:\Users\username
 */
function shortenUserHomePath(path: string): string | null {
  const match = path.match(/^((?:[A-Za-z]:)?[\\/](?:Users|home)[\\/][^\\/]+)(?=([\\/]|$))/);
  if (!match || typeof match[1] !== 'string') {
    return null;
  }

  return replacePrefix(path, match[1].length, '~');
}

/**
 * Simplify a file path by replacing known prefixes with shorter aliases.
 *
 * The following replacements are attempted in order:
 * 1. DeskTalk home directory → <dt-home>
 * 2. DeskTalk data directory → <dt-data>
 * 3. User home directory → ~
 *
 * If none match, the original path is returned unchanged.
 *
 * @example
 * simplifyPath('/path/to/home/user/project/file.txt')
 * // Returns: '<dt-home>/project/file.txt'
 *
 * @example
 * simplifyPath('/Users/alice/Documents/file.txt')
 * // Returns: '~/Documents/file.txt'
 */
export function simplifyPath(path: string): string {
  return (
    shortenDeskTalkHomePath(path) ??
    shortenDeskTalkDataPath(path) ??
    shortenUserHomePath(path) ??
    path
  );
}
