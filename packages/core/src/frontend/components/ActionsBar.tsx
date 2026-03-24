import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useWindowManager } from '../stores/window-manager';
import { LauncherPanel } from './LauncherPanel';
import { SplitModeIcon } from './SplitModeIcon';
import type { LauncherApp } from './launcher-types';
import styles from './ActionsBar.module.scss';

const SPLIT_CYCLE: Array<'auto' | 'horizontal' | 'vertical'> = ['auto', 'horizontal', 'vertical'];

const SPLIT_LABELS: Record<string, string> = {
  auto: 'Auto',
  horizontal: 'Horizontal',
  vertical: 'Vertical',
};

interface ActionsBarProps {
  apps: LauncherApp[];
  onLaunch: (app: LauncherApp) => void;
}

export function ActionsBar({ apps, onLaunch }: ActionsBarProps) {
  const focusedWindowId = useWindowManager((s) => s.focusedWindowId);
  const fullscreenWindowId = useWindowManager((s) => s.fullscreenWindowId);
  const focusedWindow = useWindowManager((s) => s.windows.find((w) => w.id === s.focusedWindowId));
  const focusedWindowActions = useWindowManager((s) => s.focusedWindowActions);
  const nextSplitDirection = useWindowManager((s) => s.nextSplitDirection);
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

  const cycleSplitMode = useCallback(() => {
    const idx = SPLIT_CYCLE.indexOf(nextSplitDirection);
    const next = SPLIT_CYCLE[(idx + 1) % SPLIT_CYCLE.length];
    useWindowManager.getState().setNextSplitDirection(next);
  }, [nextSplitDirection]);

  const isFullscreen = focusedWindowId === fullscreenWindowId && fullscreenWindowId !== null;
  const splitTooltip = `${$localize`split.mode:Split mode`}: ${SPLIT_LABELS[nextSplitDirection]}`;

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
          apps={apps}
          isOpen={launcherOpen}
          onClose={() => setLauncherOpen(false)}
          onLaunch={onLaunch}
          anchorRef={buttonRef}
        />
      </div>

      <dt-tooltip content={splitTooltip} placement="bottom">
        <button
          className={`${styles.splitToggle}${nextSplitDirection !== 'auto' ? ` ${styles.splitToggleActive}` : ''}`}
          onClick={cycleSplitMode}
        >
          <SplitModeIcon mode={nextSplitDirection} />
        </button>
      </dt-tooltip>

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
                <dt-tooltip key={action.name} content={action.description} placement="bottom">
                  <button
                    className={`${styles.action}${glowing ? ` ${styles.glowing}` : ''}`}
                    onClick={() => action.handler()}
                  >
                    {action.name}
                  </button>
                </dt-tooltip>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}
