/** Map file extensions to Monaco Editor language identifiers. */

const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.json': 'json',
  '.jsonc': 'json',
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'scss',
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'ini', // Monaco doesn't have a native TOML mode; ini is close
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  '.xml': 'xml',
  '.svg': 'xml',
  '.sql': 'sql',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.hpp': 'cpp',
  '.cc': 'cpp',
  '.rb': 'ruby',
  '.txt': 'plaintext',
  '.log': 'plaintext',
};

/**
 * Detect the Monaco language identifier from a filename.
 * Falls back to 'plaintext' for unknown extensions.
 */
export function detectLanguage(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot < 0) return 'plaintext';
  const ext = filename.slice(dot).toLowerCase();
  return EXTENSION_LANGUAGE_MAP[ext] ?? 'plaintext';
}

/**
 * Detect line ending style from file content.
 * Returns 'CRLF' if any \r\n is found, otherwise 'LF'.
 */
export function detectLineEnding(content: string): 'LF' | 'CRLF' {
  return content.includes('\r\n') ? 'CRLF' : 'LF';
}
