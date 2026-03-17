import React from 'react';
import { TerminalView } from './TerminalView';
import styles from './TerminalContainer.module.css';

interface TerminalContainerProps {
  tabIds: string[];
  activeTabId: string | null;
}

export function TerminalContainer({ tabIds, activeTabId }: TerminalContainerProps) {
  return (
    <div className={styles.container}>
      {tabIds.map((tabId) => (
        <div
          key={tabId}
          className={tabId === activeTabId ? styles.terminalWrapper : styles.terminalHidden}
        >
          <TerminalView tabId={tabId} visible={tabId === activeTabId} />
        </div>
      ))}
    </div>
  );
}
