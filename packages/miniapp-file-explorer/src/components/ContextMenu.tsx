import React, { useEffect, useRef, useCallback } from 'react';
import styles from '../FileExplorerApp.module.css';

export interface ContextMenuAction {
  label: string;
  danger?: boolean;
  handler: () => void;
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

  return (
    <div ref={menuRef} className={styles.contextMenu} style={style}>
      {actions.map((action, index) => (
        <button
          key={index}
          className={action.danger ? styles.contextMenuDanger : styles.contextMenuItem}
          onClick={() => {
            action.handler();
            onClose();
          }}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
