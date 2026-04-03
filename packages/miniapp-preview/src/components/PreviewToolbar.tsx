import React from 'react';
import type { PreviewMode } from '../types';
import { BrowserPreviewToolbar } from './BrowserPreviewToolbar';
import styles from './PreviewToolbar.module.css';

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
  onShowHistory?: () => void;
  onEditSource?: () => void;
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
  onShowHistory,
  onEditSource,
}: PreviewToolbarProps) {
  // HTML and stream modes: browser-like toolbar
  if (mode === 'html' || mode === 'stream') {
    return (
      <BrowserPreviewToolbar
        filename={filename}
        filepath={filepath}
        streaming={streaming}
        onRefreshFromFile={onRefreshFromFile}
        onShowHistory={onShowHistory}
        onEditSource={onEditSource}
      />
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
