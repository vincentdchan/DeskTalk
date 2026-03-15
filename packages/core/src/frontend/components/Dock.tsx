import React, { useState } from 'react';
import styles from './Dock.module.scss';
import { DockIcon } from './DockIcon';
import { Tooltip } from './Tooltip';
import { ContextMenu } from './ContextMenu';

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
  onQuitApp?: (miniAppId: string) => void;
  onHideApp?: (miniAppId: string) => void;
}

const menuItems = [
  { id: 'hide', label: 'Hide' },
  { id: 'quit', label: 'Quit' },
];

export function Dock({ miniApps, onLaunch, onQuitApp, onHideApp }: DockProps) {
  const [contextMenuOpen, setContextMenuOpen] = useState<string | null>(null);

  const handleMenuSelect = (appId: string, itemId: string) => {
    if (itemId === 'quit' && onQuitApp) {
      onQuitApp(appId);
    } else if (itemId === 'hide' && onHideApp) {
      onHideApp(appId);
    }
    setContextMenuOpen(null);
  };

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
            <ContextMenu
              items={menuItems}
              onSelect={(itemId) => handleMenuSelect(app.id, itemId)}
              onOpen={() => setContextMenuOpen(app.id)}
            >
              <Tooltip content={app.name} disabled={contextMenuOpen === app.id}>
                <DockIcon
                  icon={app.icon}
                  iconPng={app.iconPng}
                  className={styles.dockIconHoverTarget}
                />
              </Tooltip>
            </ContextMenu>
            {app.hasOpenWindows && <div className={styles.activeIndicator} />}
          </button>
        ))}
      </div>
    </div>
  );
}
