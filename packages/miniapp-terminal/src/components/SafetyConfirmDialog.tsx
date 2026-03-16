import React from 'react';
import styles from './SafetyConfirmDialog.module.css';

interface SafetyConfirmDialogProps {
  command: string;
  risk: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function SafetyConfirmDialog({
  command,
  risk,
  onConfirm,
  onCancel,
}: SafetyConfirmDialogProps) {
  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.warningIcon}>⚠</span>
          <span className={styles.title}>Potentially destructive command</span>
        </div>
        <div className={styles.commandBlock}>{command}</div>
        <div className={styles.riskText}>{risk}</div>
        <div className={styles.buttons}>
          <button className={styles.cancelBtn} onClick={onCancel}>
            Cancel
          </button>
          <button className={styles.confirmBtn} onClick={onConfirm}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
