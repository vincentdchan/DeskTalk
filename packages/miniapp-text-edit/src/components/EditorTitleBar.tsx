import React from 'react';
import styles from '../styles/TextEditApp.module.css';

interface EditorTitleBarProps {
  filename: string | null;
  isDirty: boolean;
  saveStatus: 'idle' | 'saving' | 'saved';
  onSave: () => void;
}

export function EditorTitleBar({ filename, isDirty, saveStatus, onSave }: EditorTitleBarProps) {
  if (!filename) return null;

  const displayName = isDirty ? `${filename} (modified)` : filename;

  return (
    <div className={styles.titleBar}>
      <span className={styles.titleFilename} title={filename}>
        {displayName}
      </span>
      <div className={styles.titleActions}>
        <span className={saveStatus === 'saving' ? styles.saveStatusSaving : styles.saveStatus}>
          {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : ''}
        </span>
        <button
          className={styles.saveBtn}
          onClick={onSave}
          disabled={!isDirty}
          title="Save (Cmd+S)"
        >
          Save
        </button>
      </div>
    </div>
  );
}
