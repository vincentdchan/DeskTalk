import React, { useEffect, useRef, useCallback } from 'react';
import styles from '../FileExplorerApp.module.css';

export interface ContextMenuAction {
  label: string;
  danger?: boolean;
  handler?: () => void;
  children?: ContextMenuAction[];
}

interface ContextMenuProps {
  x: number;
  y: number;
  actions: ContextMenuAction[];
  onClose: () => void;
}

export function ContextMenu({ x, y, actions, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [handleClickOutside]);

  // Adjust position to stay within viewport
  const style: React.CSSProperties = {
    left: x,
    top: y,
  };

  const renderActions = (menuActions: ContextMenuAction[], nested = false) => (
    <div className={nested ? styles.contextSubmenu : styles.contextMenuList}>
      {menuActions.map((action, index) => {
        const className = action.danger ? styles.contextMenuDanger : styles.contextMenuItem;

        if (action.children && action.children.length > 0) {
          return (
            <div key={`${action.label}-${index}`} className={styles.contextMenuSubmenuTrigger}>
              <button type="button" className={className}>
                <span>{action.label}</span>
                <span className={styles.contextMenuChevron}>{'\u25B8'}</span>
              </button>
              {renderActions(action.children, true)}
            </div>
          );
        }

        return (
          <button
            key={`${action.label}-${index}`}
            type="button"
            className={className}
            onClick={() => {
              action.handler?.();
              onClose();
            }}
          >
            {action.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div ref={menuRef} className={styles.contextMenu} style={style}>
      {renderActions(actions)}
    </div>
  );
}
