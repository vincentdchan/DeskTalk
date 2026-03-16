import React from 'react';
import styles from './TerminalTabBar.module.css';

interface TabInfo {
  tabId: string;
  label: string;
  running: boolean;
}

interface TerminalTabBarProps {
  tabs: TabInfo[];
  activeTabId: string | null;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onNewTab: () => void;
}

export function TerminalTabBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
}: TerminalTabBarProps) {
  return (
    <div className={styles.tabBar}>
      {tabs.map((tab) => (
        <div
          key={tab.tabId}
          className={tab.tabId === activeTabId ? styles.tabActive : styles.tab}
          onClick={() => onSelectTab(tab.tabId)}
        >
          <span className={styles.tabLabel}>
            {tab.label}
            {!tab.running && ' (exited)'}
          </span>
          <button
            className={styles.tabCloseBtn}
            onClick={(e) => {
              e.stopPropagation();
              onCloseTab(tab.tabId);
            }}
            title="Close tab"
          >
            ×
          </button>
        </div>
      ))}
      <button className={styles.newTabBtn} onClick={onNewTab} title="New tab">
        +
      </button>
    </div>
  );
}
