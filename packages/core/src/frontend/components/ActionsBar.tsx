import React from 'react';
import { useWindowManager } from '../stores/window-manager.js';
import styles from '../styles/ActionsBar.module.scss';

export function ActionsBar() {
  const focusedWindow = useWindowManager((s) => s.windows.find((w) => w.focused));
  const focusedWindowActions = useWindowManager((s) => s.focusedWindowActions);

  return (
    <div className={styles.actionsBar}>
      <span className={styles.appName}>{$localize`appName:DeskTalk`}</span>

      {focusedWindow && (
        <>
          <div className={styles.separator} />

          <button
            className={styles.builtinAction}
            onClick={() => useWindowManager.getState().maximizeWindow(focusedWindow.id)}
          >
            {focusedWindow.maximized
              ? $localize`window.restore:Restore`
              : $localize`window.maximize:Maximize`}
          </button>
          <button
            className={styles.builtinAction}
            onClick={() => useWindowManager.getState().minimizeWindow(focusedWindow.id)}
          >
            {$localize`window.minimize:Minimize`}
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
