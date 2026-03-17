import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { MiniAppManifest, WindowState } from '@desktalk/sdk';
import { initMessaging } from '@desktalk/sdk';
import type { ActionDefinition, ActionHandler } from '@desktalk/sdk';
import {
  reportWindowActionResult,
  reportWindowActions,
  setWindowManagerSocket,
  useWindowManager,
} from '../stores/window-manager';
import { ActionsBar } from './ActionsBar';
import { Dock, type DockMiniApp } from './Dock';
import { WindowChrome } from './WindowChrome';
import { InfoPanel } from './InfoPanel';
import { loadMiniAppModule } from '../miniapp-runtime';
import type { MiniAppFrontendModule } from '../miniapp-runtime';
import { httpClient } from '../http-client';
import styles from './Shell.module.scss';

/**
 * Fallback UI when a MiniApp cannot be loaded.
 */
function MiniAppLoadError({ miniAppId, message }: { miniAppId: string; message: string }) {
  return (
    <div style={{ padding: 24, color: 'var(--dt-text-muted)' }}>
      <h3>{miniAppId}</h3>
      <p>{message}</p>
    </div>
  );
}

/**
 * Window content that loads the MiniApp bundle on demand.
 * Provides a root DOM element and calls activate/deactivate on the MiniApp module.
 */
function MiniAppWindow({
  miniAppId,
  windowId,
  args,
}: {
  miniAppId: string;
  windowId: string;
  args?: Record<string, unknown>;
}) {
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
            args,
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
    iconPng: app.iconPng,
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

  // Fetch MiniApp manifests on mount
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await httpClient.get<MiniAppManifest[]>('/api/miniapps');
        if (!cancelled) {
          setManifests(response.data);
        }
      } catch (error) {
        console.error('[shell] Could not load MiniApps:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Update dock apps when manifests or windows change
  useEffect(() => {
    setDockApps(toDockMiniApps(manifests, windows));
  }, [manifests, windows]);

  // Wire up the window manager socket
  useEffect(() => {
    setWindowManagerSocket(socket);
    return () => {
      setWindowManagerSocket(null);
    };
  }, [socket]);

  // Listen to server messages for window state restore, AI commands, and action invocations
  useEffect(() => {
    if (!socket) {
      return;
    }

    const handleWindowMessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data as string) as Record<string, unknown>;

        // Initial state restore from backend on connect
        if (message.type === 'window:state') {
          const payload = message as unknown as {
            type: string;
            windows: WindowState[];
            nextZIndex: number;
            windowIdCounter: number;
          };
          useWindowManager.getState().restoreFromBackend({
            windows: payload.windows ?? [],
            nextZIndex: typeof payload.nextZIndex === 'number' ? payload.nextZIndex : 1,
            windowIdCounter:
              typeof payload.windowIdCounter === 'number' ? payload.windowIdCounter : 0,
          });
          return;
        }

        // AI tool invocation — backend asks frontend to execute a window operation
        if (message.type === 'window:ai_command') {
          const { action, windowId, miniAppId, title, requestId, args } = message as {
            action: string;
            windowId?: string;
            miniAppId?: string;
            title?: string;
            requestId: string;
            args?: Record<string, unknown>;
          };
          handleAiCommand(action, windowId, miniAppId, title, requestId, args);
          return;
        }

        // Backend is brokering an action invocation to a MiniApp
        if (message.type === 'window:invoke_action') {
          const requestId = message.requestId as string | undefined;
          const windowId = message.windowId as string | undefined;
          const actionName = message.actionName as string | undefined;
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

          void handler(message.params as Record<string, unknown> | undefined)
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
  }, [socket]);

  /**
   * Execute a window operation locally in response to an AI tool call.
   * The store mutations will automatically sync state back to the backend.
   */
  function handleAiCommand(
    action: string,
    windowId?: string,
    miniAppId?: string,
    title?: string,
    requestId?: string,
    args?: Record<string, unknown>,
  ): void {
    const store = useWindowManager.getState();
    let resultWindowId: string | undefined;

    try {
      switch (action) {
        case 'open': {
          if (!miniAppId || !title) break;
          // Activate the miniapp on the server
          void httpClient.post(`/api/miniapps/${encodeURIComponent(miniAppId)}/activate`);
          resultWindowId = store.openWindow(miniAppId, title, args);
          break;
        }
        case 'close':
          if (windowId) store.closeWindow(windowId);
          break;
        case 'focus':
          if (windowId) store.focusWindow(windowId);
          break;
        case 'minimize':
          if (windowId) store.minimizeWindow(windowId);
          break;
        case 'maximize':
          if (windowId) store.maximizeWindow(windowId);
          break;
        default:
          console.warn(`[shell] Unknown AI window command: ${action}`);
      }

      // Send result back to the backend so the AI tool can respond
      if (requestId) {
        const ws = socket;
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'window:ai_command_result',
              requestId,
              ok: true,
              action,
              windowId: resultWindowId ?? windowId,
            }),
          );
        }
      }
    } catch (err) {
      if (requestId) {
        const ws = socket;
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'window:ai_command_result',
              requestId,
              ok: false,
              error: (err as Error).message,
            }),
          );
        }
      }
    }
  }

  // Listen for MiniApp action registrations from within windows
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

  // Listen for MiniApp requests to open another MiniApp window
  useEffect(() => {
    const handleOpenWindow = (event: Event) => {
      const { miniAppId, args } = (
        event as CustomEvent<{ miniAppId: string; args?: Record<string, unknown> }>
      ).detail;
      if (!miniAppId) return;

      void (async () => {
        try {
          await httpClient.post(`/api/miniapps/${encodeURIComponent(miniAppId)}/activate`);
          const manifest = manifests.find((m) => m.id === miniAppId);
          const title = manifest?.name ?? miniAppId;
          useWindowManager.getState().openWindow(miniAppId, title, args);
        } catch (err) {
          console.error('[shell] Could not open MiniApp window:', err);
        }
      })();
    };

    window.addEventListener('desktalk:open-window', handleOpenWindow);
    return () => {
      window.removeEventListener('desktalk:open-window', handleOpenWindow);
    };
  }, [manifests]);

  const handleLaunch = useCallback(
    async (miniAppId: string) => {
      try {
        const store = useWindowManager.getState();
        const existingWindow = store
          .getWindowsByMiniApp(miniAppId)
          .reduce<WindowState | undefined>((selected, window) => {
            if (!selected) {
              return window;
            }
            if (window.focused) {
              return window;
            }
            return window.zIndex > selected.zIndex ? window : selected;
          }, undefined);

        if (existingWindow) {
          store.focusWindow(existingWindow.id);
          return;
        }

        // Activate on server
        await httpClient.post(`/api/miniapps/${encodeURIComponent(miniAppId)}/activate`);
        // Find the manifest to get the title
        const manifest = manifests.find((m) => m.id === miniAppId);
        const title = manifest?.name ?? miniAppId;
        // Open locally (syncs to backend automatically)
        useWindowManager.getState().openWindow(miniAppId, title);
      } catch (err) {
        console.error('[shell] Could not launch MiniApp:', err);
      }
    },
    [manifests],
  );

  const handleHideApp = useCallback((miniAppId: string) => {
    const store = useWindowManager.getState();
    const windowsToHide = store
      .getWindowsByMiniApp(miniAppId)
      .filter((window) => !window.minimized);

    windowsToHide.forEach((window) => {
      store.minimizeWindow(window.id);
    });
  }, []);

  const handleQuitApp = useCallback(async (miniAppId: string) => {
    const store = useWindowManager.getState();
    const windowsToClose = store.getWindowsByMiniApp(miniAppId);

    windowsToClose.forEach((window) => {
      store.closeWindow(window.id);
    });

    try {
      await httpClient.post(`/api/miniapps/${encodeURIComponent(miniAppId)}/deactivate`);
    } catch (err) {
      console.error('[shell] Could not quit MiniApp:', err);
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
                  <MiniAppWindow miniAppId={win.miniAppId} windowId={win.id} args={win.args} />
                </WindowChrome>
              ))
            : windows.length > 0 && (
                <div style={{ padding: 24, color: 'var(--dt-text-muted)' }}>
                  Connecting to server...
                </div>
              )}
        </div>

        <div className={styles.infoPanel}>
          <InfoPanel socket={socket} wsReady={wsReady} />
        </div>
      </div>

      <div className={styles.dock}>
        <Dock
          miniApps={dockApps}
          onLaunch={handleLaunch}
          onHideApp={handleHideApp}
          onQuitApp={handleQuitApp}
        />
      </div>
    </div>
  );
}
