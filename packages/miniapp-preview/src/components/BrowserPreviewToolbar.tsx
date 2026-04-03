import React from 'react';
import { simplifyPath } from '@desktalk/sdk';
import { FaHistory } from 'react-icons/fa';
import styles from './BrowserPreviewToolbar.module.css';

interface BrowserPreviewToolbarProps {
  filename: string;
  filepath?: string;
  streaming?: boolean;
  onRefreshFromFile?: () => void;
  onShowHistory?: () => void;
  onEditSource?: () => void;
}

export function BrowserPreviewToolbar({
  filename,
  filepath,
  streaming,
  onRefreshFromFile,
  onShowHistory,
  onEditSource,
}: BrowserPreviewToolbarProps) {
  return (
    <div className={styles.toolbar}>
      <div className={styles.browserNavGroup}>
        {!streaming && onRefreshFromFile ? (
          <button
            className={styles.browserNavBtn}
            onClick={onRefreshFromFile}
            title="Refresh"
            aria-label="Refresh"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="23 4 23 10 17 10"></polyline>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
            </svg>
          </button>
        ) : (
          <button className={styles.browserNavBtn} disabled aria-hidden="true">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="23 4 23 10 17 10"></polyline>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
            </svg>
          </button>
        )}
      </div>

      <div className={styles.addressBar}>
        {streaming ? (
          <div className={styles.streamingIndicator}>
            <span className={styles.streamingDot}></span>
            <span>Streaming...</span>
          </div>
        ) : (
          <>
            <svg
              className={styles.lockIcon}
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            <span className={styles.addressText} title={filepath || filename}>
              file://{simplifyPath(filepath || filename)}
            </span>
          </>
        )}
      </div>

      <div className={styles.browserNavGroup}>
        {onShowHistory && !streaming ? (
          <button
            className={styles.browserActionBtn}
            onClick={onShowHistory}
            title="History"
            aria-label="History"
          >
            <FaHistory aria-hidden="true" />
          </button>
        ) : null}
        {onEditSource && !streaming ? (
          <button
            className={styles.browserNavBtn}
            onClick={onEditSource}
            title="Edit in TextEdit"
            aria-label="Edit in TextEdit"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z"></path>
            </svg>
          </button>
        ) : !onShowHistory || streaming ? (
          <div className={styles.browserActionSpacer} aria-hidden="true" />
        ) : null}
        {!onEditSource && onShowHistory && !streaming ? (
          <div className={styles.browserActionSpacer} aria-hidden="true" />
        ) : null}
      </div>
    </div>
  );
}
