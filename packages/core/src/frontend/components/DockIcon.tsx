import React from 'react';
import styles from './Dock.module.scss';

interface DockIconProps {
  icon: string;
  iconPng?: string;
}

export function DockIcon({ icon, iconPng }: DockIconProps) {
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
