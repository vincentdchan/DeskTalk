import React from 'react';
import styles from './VoiceErrorBanner.module.scss';

interface VoiceErrorBannerProps {
  message: string;
  onClose: () => void;
}

export function VoiceErrorBanner({ message, onClose }: VoiceErrorBannerProps) {
  return (
    <div className={styles.banner}>
      <div className={styles.header}>
        <span className={styles.speaker}>VOICE</span>
        <button
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Dismiss voice error"
        >
          &times;
        </button>
      </div>
      <span className={styles.message}>{message}</span>
    </div>
  );
}
