/** Shared data types for the TextEdit MiniApp. */

export interface TextEditFile {
  /** Relative path to user home (e.g. "src/index.ts") */
  path: string;
  /** Filename (e.g. "index.ts") */
  name: string;
  /** Full file content as UTF-8 text */
  content: string;
  /** File size in bytes */
  size: number;
  /** ISO 8601 last-modified timestamp */
  modifiedAt: string;
}

export interface SaveResult {
  success: boolean;
  updatedAt: string;
}
