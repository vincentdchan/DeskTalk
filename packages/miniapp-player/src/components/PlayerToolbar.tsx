import React from 'react';
import styles from './PlayerToolbar.module.css';

interface PlayerToolbarProps {
  filename: string;
  canGoPrevious: boolean;
  canGoNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}

export function PlayerToolbar({
  filename,
  canGoPrevious,
  canGoNext,
  onPrevious,
  onNext,
}: PlayerToolbarProps) {
  return (
    <div className={styles.toolbar}>
      <button
        type="button"
        className={styles.navButton}
        onClick={onPrevious}
        disabled={!canGoPrevious}
        title="Previous file"
      >
        {'\u2039'}
      </button>
      <button
        type="button"
        className={styles.navButton}
        onClick={onNext}
        disabled={!canGoNext}
        title="Next file"
      >
        {'\u203A'}
      </button>
      <div className={styles.title}>{filename}</div>
    </div>
  );
}
