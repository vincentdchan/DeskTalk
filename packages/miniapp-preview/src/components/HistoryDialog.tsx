import React, { useMemo } from 'react';
import type { PreviewHistoryEntry } from '../types';
import styles from './HistoryDialog.module.css';

interface HistoryDialogProps {
  entries: PreviewHistoryEntry[];
  restoringHash?: string | null;
  onRestore: (entry: PreviewHistoryEntry) => void;
  onClose: () => void;
}

export function HistoryDialog({
  entries,
  restoringHash = null,
  onRestore,
  onClose,
}: HistoryDialogProps) {
  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [],
  );

  return (
    <div className={styles.dialogOverlay} onClick={onClose}>
      <div className={styles.dialogCard} onClick={(event) => event.stopPropagation()}>
        <div className={styles.dialogHeader}>
          <div>
            <div className={styles.dialogTitle}>History</div>
            <div className={styles.dialogSubtitle}>Select a saved version to restore.</div>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close history"
          >
            {'\u2715'}
          </button>
        </div>

        {entries.length === 0 ? (
          <div className={styles.emptyState}>No saved history yet.</div>
        ) : (
          <div className={styles.historyList}>
            {entries.map((entry) => {
              const formattedDate = Number.isNaN(Date.parse(entry.date))
                ? entry.date
                : formatter.format(new Date(entry.date));

              return (
                <button
                  key={entry.hash}
                  type="button"
                  className={styles.historyItem}
                  onClick={() => onRestore(entry)}
                  disabled={restoringHash !== null}
                >
                  <div className={styles.historyMessage}>{entry.message}</div>
                  <div className={styles.historyMeta}>
                    <span>{formattedDate}</span>
                    <span className={styles.historyHash}>{entry.hash.slice(0, 7)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
