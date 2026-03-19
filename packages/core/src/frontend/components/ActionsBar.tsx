import React, { useEffect, useRef, useState } from 'react';
import type { MiniAppManifest } from '@desktalk/sdk';
import { useWindowManager } from '../stores/window-manager';
import { LauncherPanel } from './LauncherPanel';
import styles from './ActionsBar.module.scss';

interface ActionsBarProps {
  manifests: MiniAppManifest[];
  onLaunch: (miniAppId: string) => void;
}

export function ActionsBar({ manifests, onLaunch }: ActionsBarProps) {
  const focusedWindowId = useWindowManager((s) => s.focusedWindowId);
  const fullscreenWindowId = useWindowManager((s) => s.fullscreenWindowId);
  const focusedWindow = useWindowManager((s) => s.windows.find((w) => w.id === s.focusedWindowId));
  const focusedWindowActions = useWindowManager((s) => s.focusedWindowActions);
  const [glowing, setGlowing] = useState(false);
  const prevActionsRef = useRef(focusedWindowActions);

  const [launcherOpen, setLauncherOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (focusedWindowActions.length > 0 && focusedWindowActions !== prevActionsRef.current) {
      setGlowing(true);
      const timer = setTimeout(() => setGlowing(false), 1200);
      prevActionsRef.current = focusedWindowActions;
      return () => clearTimeout(timer);
    }
    prevActionsRef.current = focusedWindowActions;
  }, [focusedWindowActions]);

  const isFullscreen = focusedWindowId === fullscreenWindowId && fullscreenWindowId !== null;

  return (
    <div className={styles.actionsBar}>
      <div className={styles.launcherWrapper}>
        <button
          ref={buttonRef}
          className={`${styles.appName}${launcherOpen ? ` ${styles.appNameActive}` : ''}`}
          onClick={() => setLauncherOpen((prev) => !prev)}
        >
          {$localize`applications:Applications`}
        </button>

        <LauncherPanel
          manifests={manifests}
          isOpen={launcherOpen}
          onClose={() => setLauncherOpen(false)}
          onLaunch={onLaunch}
          anchorRef={buttonRef}
        />
      </div>

      {focusedWindow && (
        <>
          <div className={styles.separator} />

          <button
            className={styles.builtinAction}
            onClick={() => useWindowManager.getState().maximizeWindow(focusedWindow.id)}
          >
            {isFullscreen
              ? $localize`window.restore:Restore`
              : $localize`window.fullscreen:Fullscreen`}
          </button>
          <button
            className={styles.builtinAction}
            onClick={() => useWindowManager.getState().closeWindow(focusedWindow.id)}
          >
            {$localize`close:Close`}
          </button>

          {focusedWindowActions.length > 0 && (
            <>
              <div className={styles.separator} />
              {focusedWindowActions.map((action) => (
                <button
                  key={action.name}
                  className={`${styles.action}${glowing ? ` ${styles.glowing}` : ''}`}
                  title={action.description}
                  onClick={() => action.handler()}
                >
                  {action.name}
                </button>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}
