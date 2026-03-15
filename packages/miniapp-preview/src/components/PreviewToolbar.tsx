import React from 'react';
import styles from '../PreviewApp.module.css';

interface PreviewToolbarProps {
  filename: string;
  zoomPercent: number;
  canGoPrev: boolean;
  canGoNext: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitToWindow: () => void;
  onActualSize: () => void;
  onPrevious: () => void;
  onNext: () => void;
}

export function PreviewToolbar({
  filename,
  zoomPercent,
  canGoPrev,
  canGoNext,
  onZoomIn,
  onZoomOut,
  onFitToWindow,
  onActualSize,
  onPrevious,
  onNext,
}: PreviewToolbarProps) {
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
        <span className={styles.zoomIndicator}>{zoomPercent}%</span>
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
