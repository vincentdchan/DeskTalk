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

interface DockIconProps {
  icon: string;
  iconPng?: string;
}

function DockIcon({ icon, iconPng }: DockIconProps) {
  return (
    <div className={styles.dockIcon}>
      {iconPng ? (
        <img className={styles.dockIconImage} src={iconPng} alt="" aria-hidden="true" />
      ) : (
        <span>{icon}</span>
      )}
    </div>
  );
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
            aria-label={app.name}
          >
            <DockIcon icon={app.icon} iconPng={app.iconPng} />
            <span className={styles.dockLabel}>{app.name}</span>
            {app.hasOpenWindows && <div className={styles.activeIndicator} />}
          </button>
        ))}
      </div>
    </div>
  );
}
