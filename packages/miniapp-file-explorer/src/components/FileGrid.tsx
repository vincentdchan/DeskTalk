import React, { useEffect, useRef } from 'react';
import type { FileEntry } from '../types';
import { getFileIcon } from './FileList';
import styles from './FileGrid.module.css';

export interface FileGridProps {
  entries: FileEntry[];
  selectedPath: string | null;
  renamingPath: string | null;
  renameValue: string;
  onSelect: (entry: FileEntry) => void;
  onOpen: (entry: FileEntry) => void;
  onContextMenu: (e: React.MouseEvent, entry: FileEntry) => void;
  onRenameChange: (value: string) => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
}

function getExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot).toLowerCase() : '';
}

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp']);

function isImageFile(name: string): boolean {
  return IMAGE_EXTENSIONS.has(getExtension(name));
}

function getThumbnailUrl(entry: FileEntry): string | null {
  if (!isImageFile(entry.name)) {
    return null;
  }
  return `/api/files/thumbnail?path=${encodeURIComponent(entry.path)}&size=96`;
}

export const FileGrid: React.FC<FileGridProps> = ({
  entries,
  selectedPath,
  renamingPath,
  renameValue,
  onSelect,
  onOpen,
  onContextMenu,
  onRenameChange,
  onRenameSubmit,
  onRenameCancel,
}) => {
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingPath && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingPath]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onRenameSubmit();
    } else if (e.key === 'Escape') {
      onRenameCancel();
    }
  };

  const handleBlur = () => {
    onRenameCancel();
  };

  if (entries.length === 0) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyTitle}>Folder is empty</div>
        <div className={styles.emptyHint}>Drop files here to upload</div>
      </div>
    );
  }

  return (
    <div className={styles.grid}>
      {entries.map((entry) => {
        const isSelected = selectedPath === entry.path;
        const isRenaming = renamingPath === entry.path;
        const isDirectory = entry.type === 'directory';
        const thumbnailUrl = !isDirectory ? getThumbnailUrl(entry) : null;

        return (
          <div
            key={entry.path}
            className={`${styles.item} ${isSelected ? styles.itemSelected : ''}`}
            onClick={() => onSelect(entry)}
            onDoubleClick={() => onOpen(entry)}
            onContextMenu={(e) => onContextMenu(e, entry)}
          >
            <div className={styles.iconWrapper}>
              {thumbnailUrl ? (
                <img
                  src={thumbnailUrl}
                  alt={entry.name}
                  className={styles.thumbnail}
                  loading="lazy"
                  onError={(e) => {
                    // Fallback to icon on image load error
                    (e.target as HTMLImageElement).style.display = 'none';
                    const parent = (e.target as HTMLImageElement).parentElement;
                    if (parent) {
                      const fallback = document.createElement('span');
                      fallback.className = styles.fallbackIcon;
                      fallback.textContent = getFileIcon(entry);
                      parent.appendChild(fallback);
                    }
                  }}
                />
              ) : (
                <span className={styles.icon}>{getFileIcon(entry)}</span>
              )}
            </div>
            <div className={styles.nameWrapper}>
              {isRenaming ? (
                <input
                  ref={renameInputRef}
                  className={styles.renameInput}
                  value={renameValue}
                  onChange={(e) => onRenameChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onBlur={handleBlur}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className={styles.name} title={entry.name}>
                  {entry.name}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
