import React from 'react';
import styles from './ConnectionOverlay.module.scss';

type ConnectionOverlayStatus = 'connecting' | 'connected' | 'reconnecting';

export function ConnectionOverlay({
  status,
  retryInSeconds,
}: {
  status: ConnectionOverlayStatus;
  retryInSeconds: number | null;
}) {
  if (status === 'connected') {
    return null;
  }

  const message =
    status === 'reconnecting'
      ? `Reconnecting${retryInSeconds && retryInSeconds > 0 ? ` in ${retryInSeconds}s` : ''}...`
      : 'Connecting...';

  return (
    <div className={styles.overlay} role="status" aria-live="polite" aria-busy="true">
      <div className={styles.card}>
        <span className={styles.spinner} aria-hidden="true" />
        <div className={styles.title}>{message}</div>
        <div className={styles.subtitle}>
          DeskTalk is waiting for the desktop bridge to be ready.
        </div>
      </div>
    </div>
  );
}
