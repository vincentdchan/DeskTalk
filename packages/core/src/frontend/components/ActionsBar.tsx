import React from 'react';
import { useWindowManager } from '../stores/window-manager.js';
import styles from '../styles/ActionsBar.module.css';

export function ActionsBar() {
  const focusedWindow = useWindowManager((s) => s.windows.find((w) => w.focused));
  const focusedWindowActions = useWindowManager((s) => s.focusedWindowActions);
  const closeWindow = useWindowManager((s) => s.closeWindow);
  const minimizeWindow = useWindowManager((s) => s.minimizeWindow);
  const maximizeWindow = useWindowManager((s) => s.maximizeWindow);

  return (
    <div className={styles.actionsBar}>
      <span className={styles.appName}>DeskTalk</span>

      {focusedWindow && (
        <>
          <div className={styles.separator} />

          <button
            className={styles.builtinAction}
            onClick={() => maximizeWindow(focusedWindow.id)}
          >
            {focusedWindow.maximized ? 'Restore' : 'Maximize'}
          </button>
          <button
            className={styles.builtinAction}
            onClick={() => minimizeWindow(focusedWindow.id)}
          >
            Minimize
          </button>
          <button
            className={styles.builtinAction}
            onClick={() => closeWindow(focusedWindow.id)}
          >
            Close
          </button>

          {focusedWindowActions.length > 0 && (
            <>
              <div className={styles.separator} />
              {focusedWindowActions.map((action) => (
                <button
                  key={action.name}
                  className={styles.action}
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
