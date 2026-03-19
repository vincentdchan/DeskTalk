import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MiniAppManifest } from '@desktalk/sdk';
import { createPortal } from 'react-dom';
import { DockIcon } from './DockIcon';
import styles from './LauncherPanel.module.scss';

interface LauncherPanelProps {
  manifests: MiniAppManifest[];
  isOpen: boolean;
  onClose: () => void;
  onLaunch: (miniAppId: string) => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

export function LauncherPanel({
  manifests,
  isOpen,
  onClose,
  onLaunch,
  anchorRef,
}: LauncherPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!isOpen || !anchorRef.current) return;

    function updatePosition() {
      const anchorRect = anchorRef.current?.getBoundingClientRect();
      const panelWidth = panelRef.current?.offsetWidth ?? 340;

      if (!anchorRect) return;

      const left = Math.min(
        Math.max(16, anchorRect.left),
        Math.max(16, window.innerWidth - panelWidth - 16),
      );

      setPosition({
        top: anchorRect.bottom + 16,
        left,
      });
    }

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [anchorRef, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        panelRef.current &&
        !panelRef.current.contains(target) &&
        anchorRef.current &&
        !anchorRef.current.contains(target)
      ) {
        onClose();
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, anchorRef]);

  if (!isOpen) return null;

  return createPortal(
    <div ref={panelRef} className={styles.panel} style={position}>
      {manifests.length === 0 && <div className={styles.empty}>No applications available</div>}
      {manifests.map((app) => (
        <button
          key={app.id}
          className={styles.item}
          onClick={() => {
            onLaunch(app.id);
            onClose();
          }}
        >
          <DockIcon icon={app.icon} iconPng={app.iconPng} className={styles.icon} />
          <span className={styles.label}>{app.name}</span>
        </button>
      ))}
    </div>,
    document.body,
  );
}
