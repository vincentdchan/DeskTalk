import React from 'react';
import styles from '../styles/TextEditApp.module.css';

interface EditorStatusBarProps {
  cursorLine: number;
  cursorColumn: number;
  language: string;
  lineEnding: 'LF' | 'CRLF';
  totalLines: number;
}

export function EditorStatusBar({
  cursorLine,
  cursorColumn,
  language,
  lineEnding,
  totalLines,
}: EditorStatusBarProps) {
  return (
    <div className={styles.statusBar}>
      <span className={styles.statusItem}>
        Ln {cursorLine}, Col {cursorColumn}
      </span>
      <span className={styles.statusItem}>UTF-8</span>
      <span className={styles.statusItem}>{language}</span>
      <span className={styles.statusItem}>{lineEnding}</span>
      <span className={styles.statusItem}>{totalLines} lines</span>
    </div>
  );
}
