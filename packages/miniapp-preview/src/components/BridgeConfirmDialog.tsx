import React from 'react';
import styles from './BridgeConfirmDialog.module.css';

interface BridgeConfirmDialogProps {
  command: string;
  cwd: string;
  risk: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function BridgeConfirmDialog({
  command,
  cwd,
  risk,
  onConfirm,
  onCancel,
}: BridgeConfirmDialogProps) {
  return (
    <div className={styles.dialogOverlay} onClick={onCancel}>
      <div className={styles.dialogCard} onClick={(event) => event.stopPropagation()}>
        <div className={styles.dialogHeader}>
          <span className={styles.dialogIcon}>{'\u26A0'}</span>
          <div>
            <div className={styles.dialogTitle}>Confirm command execution</div>
            <div className={styles.dialogSubtitle}>
              This generated page is requesting a risky command.
            </div>
          </div>
        </div>
        <div className={styles.dialogLabel}>Command</div>
        <div className={styles.dialogCode}>{command}</div>
        <div className={styles.dialogLabel}>Working directory</div>
        <div className={styles.dialogCode}>{cwd}</div>
        <div className={styles.dialogRisk}>{risk}</div>
        <div className={styles.dialogActions}>
          <button type="button" className={styles.dialogCancelButton} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className={styles.dialogConfirmButton} onClick={onConfirm}>
            Run command
          </button>
        </div>
      </div>
    </div>
  );
}
