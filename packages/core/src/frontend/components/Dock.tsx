import React from 'react';
import styles from '../styles/Dock.module.css';

export interface DockMiniApp {
  id: string;
  name: string;
  icon: string | React.ComponentType;
  hasOpenWindows: boolean;
}

interface DockProps {
  miniApps: DockMiniApp[];
  onLaunch: (miniAppId: string) => void;
}

export function Dock({ miniApps, onLaunch }: DockProps) {
  return (
    <div className={styles.dockContainer}>
      <div className={styles.dock}>
        {miniApps.map((app) => (
          <button
            key={app.id}
            className={styles.dockItem}
            onClick={() => onLaunch(app.id)}
            title={app.name}
          >
            <div className={styles.dockIcon}>
              {typeof app.icon === 'string' ? (
                <span>{app.icon}</span>
              ) : (
                React.createElement(app.icon)
              )}
            </div>
            <span className={styles.dockLabel}>{app.name}</span>
            {app.hasOpenWindows && <div className={styles.activeIndicator} />}
          </button>
        ))}
      </div>
    </div>
  );
}
