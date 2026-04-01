import React, { useRef, useCallback, useEffect } from 'react';
import type { FileEntry, SortColumn, SortDirection } from '../types';
import styles from './FileList.module.css';

interface FileListProps {
  entries: FileEntry[];
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  selectedPath: string | null;
  renamingPath: string | null;
  renameValue: string;
  isUploading?: boolean;
  onSort: (column: SortColumn) => void;
  onSelect: (entry: FileEntry) => void;
  onOpen: (entry: FileEntry) => void;
  onContextMenu: (e: React.MouseEvent, entry: FileEntry) => void;
  onRenameChange: (value: string) => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
}

function formatSize(size: number | null): string {
  if (size === null) return '--';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const month = date.toLocaleString('default', { month: 'short' });
  const day = date.getDate();

  if (date.getFullYear() !== now.getFullYear()) {
    return `${month} ${day}, ${date.getFullYear()}`;
  }
  return `${month} ${day}`;
}

export function getFileIcon(entry: FileEntry): string {
  if (entry.type === 'directory') return '\uD83D\uDCC1';

  const ext = entry.name.includes('.')
    ? entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase()
    : '';

  const imageExts = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico']);
  if (imageExts.has(ext)) return '\uD83D\uDDBC\uFE0F';

  const codeExts = new Set([
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.py',
    '.rb',
    '.go',
    '.rs',
    '.java',
    '.c',
    '.cpp',
    '.h',
  ]);
  if (codeExts.has(ext)) return '\uD83D\uDCDD';

  if (ext === '.json') return '{}';
  if (ext === '.md') return '\uD83D\uDCDD';

  return '\uD83D\uDCC4';
}

function sortEntries(
  entries: FileEntry[],
  column: SortColumn,
  direction: SortDirection,
): FileEntry[] {
  const sorted = [...entries];
  sorted.sort((a, b) => {
    // Directories always first
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;

    let cmp = 0;
    switch (column) {
      case 'name':
        cmp = a.name.localeCompare(b.name);
        break;
      case 'size':
        cmp = (a.size ?? -1) - (b.size ?? -1);
        break;
      case 'modifiedAt':
        cmp = a.modifiedAt.localeCompare(b.modifiedAt);
        break;
    }
    return direction === 'asc' ? cmp : -cmp;
  });
  return sorted;
}

export function FileList({
  entries,
  sortColumn,
  sortDirection,
  selectedPath,
  renamingPath,
  renameValue,
  isUploading = false,
  onSort,
  onSelect,
  onOpen,
  onContextMenu,
  onRenameChange,
  onRenameSubmit,
  onRenameCancel,
}: FileListProps) {
  const renameInputRef = useRef<HTMLInputElement>(null);
  const sorted = sortEntries(entries, sortColumn, sortDirection);

  useEffect(() => {
    if (!renamingPath || !renameInputRef.current) {
      return;
    }

    const entry = entries.find((item) => item.path === renamingPath);
    if (!entry) {
      return;
    }

    const input = renameInputRef.current;
    const dotIndex = entry.type === 'file' ? entry.name.lastIndexOf('.') : -1;
    const selectionEnd = dotIndex > 0 ? dotIndex : entry.name.length;

    input.focus();
    input.setSelectionRange(0, selectionEnd);
  }, [entries, renamingPath]);

  const handleRenameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        onRenameSubmit();
      } else if (e.key === 'Escape') {
        onRenameCancel();
      }
    },
    [onRenameSubmit, onRenameCancel],
  );

  function renderSortIndicator(column: SortColumn) {
    if (sortColumn !== column) return null;
    return (
      <span className={styles.sortIndicator}>{sortDirection === 'asc' ? '\u25B2' : '\u25BC'}</span>
    );
  }

  if (entries.length === 0) {
    return (
      <div className={styles.emptyState}>
        <div>This directory is empty.</div>
        <div className={styles.emptyStateHint}>
          {isUploading ? 'Uploading files...' : 'Drag files here to upload them to this folder.'}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.fileListScroll}>
      <table className={styles.fileTable}>
        <thead className={styles.fileTableHead}>
          <tr>
            <th className={styles.colName} onClick={() => onSort('name')}>
              Name{renderSortIndicator('name')}
            </th>
            <th className={styles.colSize} onClick={() => onSort('size')}>
              Size{renderSortIndicator('size')}
            </th>
            <th className={styles.colModified} onClick={() => onSort('modifiedAt')}>
              Modified{renderSortIndicator('modifiedAt')}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((entry) => (
            <tr
              key={entry.path}
              className={selectedPath === entry.path ? styles.fileRowSelected : styles.fileRow}
              onClick={() => onSelect(entry)}
              onDoubleClick={() => onOpen(entry)}
              onContextMenu={(e) => onContextMenu(e, entry)}
            >
              <td>
                <div className={styles.fileName}>
                  <span className={styles.fileIcon}>{getFileIcon(entry)}</span>
                  {renamingPath === entry.path ? (
                    <input
                      ref={renameInputRef}
                      className={styles.renameInput}
                      type="text"
                      value={renameValue}
                      onChange={(e) => onRenameChange(e.target.value)}
                      onKeyDown={handleRenameKeyDown}
                      onBlur={() => {
                        onRenameSubmit();
                      }}
                      autoFocus
                    />
                  ) : (
                    <span className={styles.fileNameText}>{entry.name}</span>
                  )}
                </div>
              </td>
              <td className={styles.fileSize}>{formatSize(entry.size)}</td>
              <td className={styles.fileModified}>{formatDate(entry.modifiedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
