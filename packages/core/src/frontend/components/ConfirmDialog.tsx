import { useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { Modal } from './Modal';
import styles from './ConfirmDialog.module.scss';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  isPending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  isPending = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isPending) {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPending, onCancel]);

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      className={styles.overlay}
      role="presentation"
      onClick={() => {
        if (!isPending) {
          onCancel();
        }
      }}
    >
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <Modal size="small" className={styles.modal}>
          <div className={styles.copy}>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            <p className={styles.message}>{message}</p>
          </div>

          <div className={styles.actions}>
            <button className={styles.button} type="button" onClick={onCancel} disabled={isPending}>
              {cancelLabel}
            </button>
            <button
              className={`${styles.button} ${danger ? styles.dangerButton : styles.confirmButton}`}
              type="button"
              onClick={onConfirm}
              disabled={isPending}
            >
              {confirmLabel}
            </button>
          </div>
        </Modal>
      </div>
    </div>,
    document.body,
  );
}
