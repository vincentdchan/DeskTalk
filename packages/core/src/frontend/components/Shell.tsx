import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { MiniAppManifest, WindowState } from '@desktalk/sdk';
import { initMessaging } from '@desktalk/sdk';
import type { ActionDefinition } from '@desktalk/sdk';
import { useWindowManager } from '../stores/window-manager.js';
import { ActionsBar } from './ActionsBar.js';
import { Dock, type DockMiniApp } from './Dock.js';
import { WindowChrome } from './WindowChrome.js';
import { InfoPanel } from './InfoPanel.js';
import { loadMiniAppModule } from '../miniapp-runtime.js';
import type { MiniAppFrontendModule } from '../miniapp-runtime.js';
import styles from '../styles/Shell.module.css';

/**
 * Fallback UI when a MiniApp cannot be loaded.
 */
function MiniAppLoadError({ miniAppId, message }: { miniAppId: string; message: string }) {
  return (
    <div style={{ padding: 24, color: 'var(--color-text-muted)' }}>
      <h3>{miniAppId}</h3>
      <p>{message}</p>
    </div>
  );
}

/**
 * Window content that loads the MiniApp bundle on demand.
 * Provides a root DOM element and calls activate/deactivate on the MiniApp module.
 */
function MiniAppWindow({ miniAppId, windowId }: { miniAppId: string; windowId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const modRef = useRef<MiniAppFrontendModule | null>(null);

  useEffect(() => {
    let cancelled = false;

    void loadMiniAppModule(miniAppId)
      .then((loadedMod) => {
        if (!cancelled && containerRef.current) {
          modRef.current = loadedMod;
          loadedMod.activate({
            root: containerRef.current,
            miniAppId,
            windowId,
          });
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError((err as Error).message);
        }
      });

    return () => {
      cancelled = true;
      if (modRef.current) {
        modRef.current.deactivate();
        modRef.current = null;
      }
    };
  }, [miniAppId, windowId]);

  if (error) {
    return <MiniAppLoadError miniAppId={miniAppId} message={error} />;
  }

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}

function toDockMiniApps(manifests: MiniAppManifest[], windows: WindowState[]): DockMiniApp[] {
  return manifests.map((app) => ({
    id: app.id,
    name: app.name,
    icon: app.icon,
    hasOpenWindows: windows.some((w) => w.miniAppId === app.id && !w.minimized),
  }));
}

/**
 * Hook that creates and manages the WebSocket connection to the server.
 * Returns true when the connection is open and ready for messaging.
 */
function useWebSocket(): { ready: boolean; socket: WebSocket | null } {
  const [ready, setReady] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Build WS URL relative to the current page origin
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.addEventListener('open', () => {
      console.log('[shell] WebSocket connected');
      initMessaging(ws);
      setReady(true);
    });

    ws.addEventListener('close', () => {
      console.log('[shell] WebSocket disconnected');
      setReady(false);
    });

    ws.addEventListener('error', (event) => {
      console.error('[shell] WebSocket error:', event);
    });

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, []);

  return { ready, socket: wsRef.current };
}

export function Shell() {
  const { ready: wsReady, socket } = useWebSocket();

  const windows = useWindowManager((s) => s.windows);
  const openWindow = useWindowManager((s) => s.openWindow);
  const setWindowActions = useWindowManager((s) => s.setWindowActions);

  const [manifests, setManifests] = useState<MiniAppManifest[]>([]);
  const [dockApps, setDockApps] = useState<DockMiniApp[]>([]);

  useEffect(() => {
    let cancelled = false;

    void fetch('/api/miniapps')
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to load MiniApps (${response.status})`);
        }
        return (await response.json()) as MiniAppManifest[];
      })
      .then((data) => {
        if (!cancelled) {
          setManifests(data);
        }
      })
      .catch((err) => {
        console.error('[shell] Could not load MiniApps:', err);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setDockApps(toDockMiniApps(manifests, windows));
  }, [manifests, windows]);

  useEffect(() => {
    const handleActionsChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{
        windowId: string;
        actions: ActionDefinition[];
      }>;
      if (!customEvent.detail?.windowId) return;
      setWindowActions(customEvent.detail.windowId, customEvent.detail.actions ?? []);
    };

    window.addEventListener('desktalk:actions-changed', handleActionsChanged);
    return () => {
      window.removeEventListener('desktalk:actions-changed', handleActionsChanged);
    };
  }, [setWindowActions]);

  const handleLaunch = useCallback(
    async (miniAppId: string) => {
      try {
        const app = manifests.find((entry) => entry.id === miniAppId);
        const title = app?.name ?? miniAppId;

        const response = await fetch(`/api/miniapps/${encodeURIComponent(miniAppId)}/activate`, {
          method: 'POST',
        });
        if (!response.ok) {
          throw new Error(`Failed to activate MiniApp "${miniAppId}"`);
        }

        openWindow(miniAppId, title);
      } catch (err) {
        console.error('[shell] Could not launch MiniApp:', err);
      }
    },
    [manifests, openWindow],
  );

  return (
    <div className={styles.shell}>
      <div className={styles.actionsBar}>
        <ActionsBar />
      </div>

      <div className={styles.content}>
        <div className={styles.desktop}>
          {wsReady
            ? windows.map((win) => (
                <WindowChrome key={win.id} window={win}>
                  <MiniAppWindow miniAppId={win.miniAppId} windowId={win.id} />
                </WindowChrome>
              ))
            : windows.length > 0 && (
                <div style={{ padding: 24, color: 'var(--color-text-muted)' }}>
                  Connecting to server...
                </div>
              )}
        </div>

        <div className={styles.infoPanel}>
          <InfoPanel socket={socket} wsReady={wsReady} />
        </div>
      </div>

      <div className={styles.dock}>
        <Dock miniApps={dockApps} onLaunch={handleLaunch} />
      </div>
    </div>
  );
}
