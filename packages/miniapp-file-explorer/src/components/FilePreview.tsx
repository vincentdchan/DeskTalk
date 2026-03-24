import React from 'react';
import type { FileEntry } from '../types';
import styles from './FilePreview.module.css';

interface FilePreviewProps {
  entry: FileEntry | null;
  content: string | null;
  loading: boolean;
  onClose: () => void;
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return '--';
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function isImageMime(mimeType: string | null): boolean {
  return mimeType !== null && mimeType.startsWith('image/');
}

function isTextMime(mimeType: string | null): boolean {
  if (mimeType === null) return false;
  return (
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    mimeType === 'application/xml'
  );
}

export function FilePreview({ entry, content, loading, onClose }: FilePreviewProps) {
  if (!entry) {
    return (
      <div className={styles.previewPanel}>
        <div className={styles.previewPlaceholder}>Select a file to preview</div>
      </div>
    );
  }

  const renderBody = () => {
    if (loading) {
      return <div className={styles.previewPlaceholder}>Loading...</div>;
    }

    if (entry.type === 'directory') {
      return (
        <div className={styles.previewMeta}>
          <div className={styles.previewMetaRow}>
            <span className={styles.previewMetaLabel}>Type</span>
            <span className={styles.previewMetaValue}>Directory</span>
          </div>
          <div className={styles.previewMetaRow}>
            <span className={styles.previewMetaLabel}>Path</span>
            <span className={styles.previewMetaValue}>{entry.path}</span>
          </div>
          <div className={styles.previewMetaRow}>
            <span className={styles.previewMetaLabel}>Last Modified</span>
            <span className={styles.previewMetaValue}>
              {new Date(entry.modifiedAt).toLocaleString()}
            </span>
          </div>
        </div>
      );
    }

    // Image files
    if (isImageMime(entry.mimeType) && content) {
      // SVG can be displayed as text or inline, other images shown as data URL
      if (entry.mimeType === 'image/svg+xml') {
        return <div className={styles.previewBody} dangerouslySetInnerHTML={{ __html: content }} />;
      }
      // For other images, we can't easily display them since we only have text content
      // Show metadata instead
      return (
        <div className={styles.previewMeta}>
          <div className={styles.previewMetaRow}>
            <span className={styles.previewMetaLabel}>Type</span>
            <span className={styles.previewMetaValue}>{entry.mimeType}</span>
          </div>
          <div className={styles.previewMetaRow}>
            <span className={styles.previewMetaLabel}>Size</span>
            <span className={styles.previewMetaValue}>{formatBytes(entry.size)}</span>
          </div>
          <div className={styles.previewMetaRow}>
            <span className={styles.previewMetaLabel}>Last Modified</span>
            <span className={styles.previewMetaValue}>
              {new Date(entry.modifiedAt).toLocaleString()}
            </span>
          </div>
        </div>
      );
    }

    // Text files
    if (isTextMime(entry.mimeType) && content !== null) {
      return <pre className={styles.previewCode}>{content}</pre>;
    }

    // Unknown/binary files — show metadata
    return (
      <div className={styles.previewMeta}>
        <div className={styles.previewMetaRow}>
          <span className={styles.previewMetaLabel}>Name</span>
          <span className={styles.previewMetaValue}>{entry.name}</span>
        </div>
        <div className={styles.previewMetaRow}>
          <span className={styles.previewMetaLabel}>Type</span>
          <span className={styles.previewMetaValue}>{entry.mimeType ?? 'Unknown'}</span>
        </div>
        <div className={styles.previewMetaRow}>
          <span className={styles.previewMetaLabel}>Size</span>
          <span className={styles.previewMetaValue}>{formatBytes(entry.size)}</span>
        </div>
        <div className={styles.previewMetaRow}>
          <span className={styles.previewMetaLabel}>Last Modified</span>
          <span className={styles.previewMetaValue}>
            {new Date(entry.modifiedAt).toLocaleString()}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className={styles.previewPanel}>
      <div className={styles.previewHeader}>
        <span className={styles.previewTitle}>{entry.name}</span>
        <button className={styles.previewCloseBtn} onClick={onClose} title="Close preview">
          {'\u2715'}
        </button>
      </div>
      <div className={styles.previewBody}>{renderBody()}</div>
    </div>
  );
}
