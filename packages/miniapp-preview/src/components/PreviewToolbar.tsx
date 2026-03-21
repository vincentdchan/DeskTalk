import React from 'react';
import type { PreviewMode } from '../types';
import styles from '../PreviewApp.module.css';

interface PreviewToolbarProps {
  filename: string;
  /** File path shown in the address bar for html/stream modes. */
  filepath?: string;
  mode: PreviewMode;
  /** Only used in image mode. */
  zoomPercent?: number;
  canGoPrev?: boolean;
  canGoNext?: boolean;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onFitToWindow?: () => void;
  onActualSize?: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  /** Shown in stream mode when content is still arriving. */
  streaming?: boolean;
  onRefreshFromFile?: () => void;
}

export function PreviewToolbar({
  filename,
  filepath,
  mode,
  zoomPercent,
  canGoPrev,
  canGoNext,
  onZoomIn,
  onZoomOut,
  onFitToWindow,
  onActualSize,
  onPrevious,
  onNext,
  streaming,
  onRefreshFromFile,
}: PreviewToolbarProps) {
  // HTML and stream modes: browser-like toolbar
  if (mode === 'html' || mode === 'stream') {
    return (
      <div className={styles.toolbar}>
        {/* Left: Navigation buttons */}
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

        {/* Center: Address bar */}
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
                file://{filepath || filename}
              </span>
            </>
          )}
        </div>

        {/* Right: spacer to balance layout */}
        <div className={styles.browserNavGroup} style={{ visibility: 'hidden' }}>
          <button className={styles.browserNavBtn} disabled>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="23 4 23 10 17 10"></polyline>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // Image mode: full toolbar with navigation and zoom controls
  return (
    <div className={styles.toolbar}>
      <div className={styles.toolbarGroup}>
        <button
          className={styles.toolBtn}
          onClick={onPrevious}
          disabled={!canGoPrev}
          title="Previous image"
        >
          {'\u25C0'}
        </button>
        <button
          className={styles.toolBtn}
          onClick={onNext}
          disabled={!canGoNext}
          title="Next image"
        >
          {'\u25B6'}
        </button>
      </div>

      <span className={styles.filename} title={filename}>
        {filename}
      </span>

      <div className={styles.toolbarGroup}>
        <button className={styles.toolBtn} onClick={onZoomOut} title="Zoom out">
          {'\u2212'}
        </button>
        <span className={styles.zoomIndicator}>{zoomPercent ?? 100}%</span>
        <button className={styles.toolBtn} onClick={onZoomIn} title="Zoom in">
          +
        </button>
        <button className={styles.toolBtn} onClick={onFitToWindow} title="Fit to window">
          {'\u2922'}
        </button>
        <button className={styles.toolBtn} onClick={onActualSize} title="Actual size (1:1)">
          1:1
        </button>
      </div>
    </div>
  );
}
