/** Shared data types for the File Explorer MiniApp. */

export interface FileEntry {
  name: string;
  path: string; // Relative to root
  type: 'file' | 'directory';
  size: number | null; // Bytes, null for directories
  mimeType: string | null;
  modifiedAt: string; // ISO 8601
}

/** Sort column for file list. */
export type SortColumn = 'name' | 'size' | 'modifiedAt';

/** Sort direction. */
export type SortDirection = 'asc' | 'desc';
