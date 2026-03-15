import React from 'react';
import styles from './Dock.module.scss';

export interface DockMiniApp {
  id: string;
  name: string;
  icon: string;
  iconPng?: string;
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
              {app.iconPng ? (
                <img className={styles.dockIconImage} src={app.iconPng} alt="" aria-hidden="true" />
              ) : (
                <span>{app.icon}</span>
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
