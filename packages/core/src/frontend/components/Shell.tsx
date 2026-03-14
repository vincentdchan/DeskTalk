import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { MiniAppManifest, WindowState } from '@desktalk/sdk';
import { initMessaging, MiniAppIdProvider, WindowIdProvider } from '@desktalk/sdk';
import type { ActionDefinition, ActionHandler } from '@desktalk/sdk';
import {
  reportWindowActionResult,
  reportWindowActions,
  requestOpen,
  setWindowManagerSocket,
  useWindowManager,
} from '../stores/window-manager.js';
import { ActionsBar } from './ActionsBar.js';
import { Dock, type DockMiniApp } from './Dock.js';
import { WindowChrome } from './WindowChrome.js';
import { InfoPanel } from './InfoPanel.js';
import { loadMiniAppComponent } from '../miniapp-runtime.js';
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
 * Wrapped in MiniAppIdProvider so useCommand/useEvent can resolve the miniAppId.
 */
function MiniAppWindow({ miniAppId, windowId }: { miniAppId: string; windowId: string }) {
  const [Component, setComponent] = useState<React.ComponentType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void loadMiniAppComponent(miniAppId)
      .then((LoadedComponent) => {
        if (!cancelled) {
          setComponent(() => LoadedComponent);
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
    };
  }, [miniAppId]);

  if (error) {
    return <MiniAppLoadError miniAppId={miniAppId} message={error} />;
  }

  if (!Component) {
    return <MiniAppLoadError miniAppId={miniAppId} message="Loading MiniApp..." />;
  }

  return (
    <WindowIdProvider windowId={windowId}>
      <MiniAppIdProvider miniAppId={miniAppId}>
        <Component />
      </MiniAppIdProvider>
    </WindowIdProvider>
  );
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
  const replaceState = useWindowManager((s) => s.replaceState);
  const setFocusedWindowActions = useWindowManager((s) => s.setFocusedWindowActions);

  const [manifests, setManifests] = useState<MiniAppManifest[]>([]);
  const [dockApps, setDockApps] = useState<DockMiniApp[]>([]);
  const actionHandlersRef = useRef<Map<string, Map<string, ActionHandler>>>(new Map());

  const buildClientActions = useCallback(
    (
      windowId: string,
      actions: Array<Pick<ActionDefinition, 'name' | 'description' | 'params'>>,
    ): ActionDefinition[] => {
      const handlerMap =
        actionHandlersRef.current.get(windowId) ?? new Map<string, ActionHandler>();
      return actions
        .map((action) => {
          const handler = handlerMap.get(action.name);
          if (!handler) {
            return null;
          }
          return {
            ...action,
            handler,
          } satisfies ActionDefinition;
        })
        .filter((action): action is ActionDefinition => action !== null);
    },
    [],
  );

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
    setWindowManagerSocket(socket);
    return () => {
      setWindowManagerSocket(null);
    };
  }, [socket]);

  useEffect(() => {
    if (!socket) {
      return;
    }

    const handleWindowMessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data as string) as {
          type?: string;
          windows?: WindowState[];
          focusedWindowActions?: Array<Pick<ActionDefinition, 'name' | 'description' | 'params'>>;
          requestId?: string;
          windowId?: string;
          actionName?: string;
          params?: Record<string, unknown>;
        };

        if (message.type === 'window:state') {
          const focusedWindowId = message.windows?.find((window) => window.focused)?.id;
          replaceState({
            windows: message.windows ?? [],
            focusedWindowActions:
              focusedWindowId && message.focusedWindowActions
                ? buildClientActions(focusedWindowId, message.focusedWindowActions)
                : [],
          });
          return;
        }

        if (message.type === 'window:invoke_action') {
          const requestId = message.requestId;
          const windowId = message.windowId;
          const actionName = message.actionName;
          if (!requestId || !windowId || !actionName) {
            return;
          }

          const handler = actionHandlersRef.current.get(windowId)?.get(actionName);
          if (!handler) {
            reportWindowActionResult(
              requestId,
              undefined,
              `Action not available on window ${windowId}: ${actionName}`,
            );
            return;
          }

          void handler(message.params)
            .then((result) => {
              reportWindowActionResult(requestId, result);
            })
            .catch((error) => {
              reportWindowActionResult(requestId, undefined, (error as Error).message);
            });
        }
      } catch {
        // Ignore malformed messages.
      }
    };

    socket.addEventListener('message', handleWindowMessage);
    return () => {
      socket.removeEventListener('message', handleWindowMessage);
    };
  }, [buildClientActions, replaceState, socket]);

  useEffect(() => {
    const handleActionsChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{
        windowId: string;
        actions: ActionDefinition[];
      }>;
      if (!customEvent.detail?.windowId) return;

      const actions = customEvent.detail.actions ?? [];
      actionHandlersRef.current.set(
        customEvent.detail.windowId,
        new Map(actions.map((action) => [action.name, action.handler])),
      );
      reportWindowActions(
        customEvent.detail.windowId,
        actions.map((action) => ({
          name: action.name,
          description: action.description,
          params: action.params,
        })),
      );

      const focusedWindow = useWindowManager.getState().getFocusedWindow();
      if (focusedWindow?.id === customEvent.detail.windowId) {
        setFocusedWindowActions(buildClientActions(customEvent.detail.windowId, actions));
      }
    };

    window.addEventListener('desktalk:actions-changed', handleActionsChanged);
    return () => {
      window.removeEventListener('desktalk:actions-changed', handleActionsChanged);
    };
  }, [buildClientActions, setFocusedWindowActions]);

  const handleLaunch = useCallback(async (miniAppId: string) => {
    try {
      requestOpen(miniAppId);
    } catch (err) {
      console.error('[shell] Could not launch MiniApp:', err);
    }
  }, []);

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
