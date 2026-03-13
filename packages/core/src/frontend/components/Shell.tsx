import React, { useCallback, useEffect, useState } from 'react';
import { useWindowManager } from '../stores/window-manager.js';
import { ActionsBar } from './ActionsBar.js';
import { Dock, type DockMiniApp } from './Dock.js';
import { WindowChrome } from './WindowChrome.js';
import { InfoPanel } from './InfoPanel.js';
import styles from '../styles/Shell.module.css';

/**
 * Placeholder components for MiniApps that aren't loaded yet.
 */
function PlaceholderApp({ miniAppId }: { miniAppId: string }) {
  return (
    <div style={{ padding: 24, color: 'var(--color-text-muted)' }}>
      <h3>{miniAppId}</h3>
      <p>This MiniApp is not yet implemented.</p>
    </div>
  );
}

/**
 * Available MiniApps — hardcoded during development.
 * Once MiniApp packages are implemented, these will be loaded dynamically
 * from the registry via the /api/miniapps endpoint.
 */
const BUILTIN_MINIAPPS: DockMiniApp[] = [
  { id: 'note', name: 'Note', icon: '\uD83D\uDDD2\uFE0F', hasOpenWindows: false },
  { id: 'todo', name: 'Todo', icon: '\u2705', hasOpenWindows: false },
  { id: 'file-explorer', name: 'Files', icon: '\uD83D\uDCC1', hasOpenWindows: false },
  { id: 'preference', name: 'Preferences', icon: '\u2699\uFE0F', hasOpenWindows: false },
];

export function Shell() {
  const windows = useWindowManager((s) => s.windows);
  const openWindow = useWindowManager((s) => s.openWindow);

  // Track which MiniApps have open windows for dock indicators
  const [dockApps, setDockApps] = useState<DockMiniApp[]>(BUILTIN_MINIAPPS);

  useEffect(() => {
    setDockApps(
      BUILTIN_MINIAPPS.map((app) => ({
        ...app,
        hasOpenWindows: windows.some((w) => w.miniAppId === app.id && !w.minimized),
      })),
    );
  }, [windows]);

  const handleLaunch = useCallback(
    (miniAppId: string) => {
      // Find the display name
      const app = BUILTIN_MINIAPPS.find((a) => a.id === miniAppId);
      const title = app?.name ?? miniAppId;
      openWindow(miniAppId, title);
    },
    [openWindow],
  );

  return (
    <div className={styles.shell}>
      <div className={styles.actionsBar}>
        <ActionsBar />
      </div>

      <div className={styles.desktop}>
        {windows.map((win) => (
          <WindowChrome key={win.id} window={win}>
            <PlaceholderApp miniAppId={win.miniAppId} />
          </WindowChrome>
        ))}
      </div>

      <div className={styles.infoPanel}>
        <InfoPanel />
      </div>

      <div className={styles.dock}>
        <Dock miniApps={dockApps} onLaunch={handleLaunch} />
      </div>
    </div>
  );
}
