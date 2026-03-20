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
import type { WindowSyncPayload } from '../stores/window-manager';
import { ActionsBar } from './ActionsBar';
import { ConnectionOverlay } from './ConnectionOverlay';
import { WindowChrome } from './WindowChrome';
import { SplitResizer } from './SplitResizer';
import { InfoPanel } from './InfoPanel';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { loadMiniAppModule } from '../miniapp-runtime';
import type { MiniAppFrontendModule } from '../miniapp-runtime';
import { httpClient } from '../http-client';
import type { TilingNode, TreePath } from '../tiling-tree';
import styles from './Shell.module.scss';

const TILE_GAP = 4;
const ASSISTANT_MIN_RATIO = 0.18;
const ASSISTANT_MAX_RATIO = 0.45;
const ASSISTANT_DEFAULT_RATIO = 0.28;
const ASSISTANT_WINDOW_ID = '__assistant__';
const INITIAL_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 15000;

type WebSocketStatus = 'connecting' | 'connected' | 'reconnecting';

type BridgeStateSelector =
  | 'desktop.summary'
  | 'desktop.windows'
  | 'desktop.focusedWindow'
  | 'theme.current';

interface BridgeStateRequestDetail {
  selector: BridgeStateSelector;
  resolve: (value: unknown) => void;
  reject: (message: string) => void;
}

function clampAssistantRatio(ratio: number): number {
  return Math.min(Math.max(ratio, ASSISTANT_MIN_RATIO), ASSISTANT_MAX_RATIO);
}

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
  const activationRef = useRef<{ deactivate(): void } | null>(null);

  useEffect(() => {
    let cancelled = false;

    void loadMiniAppModule(miniAppId)
      .then((loadedMod) => {
        if (!cancelled && containerRef.current) {
          modRef.current = loadedMod;
          activationRef.current = loadedMod.activate({
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
      const activation = activationRef.current;
      activationRef.current = null;
      modRef.current = null;
      if (activation) {
        queueMicrotask(() => {
          activation.deactivate();
        });
      }
    };
  }, [miniAppId, windowId]);

  if (error) {
    return <MiniAppLoadError miniAppId={miniAppId} message={error} />;
  }

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}

/**
 * Hook that creates and manages the WebSocket connection to the server.
 * Reconnects automatically and exposes the current connection state.
 */
function useWebSocket(): {
  status: WebSocketStatus;
  socket: WebSocket | null;
  retryInSeconds: number | null;
} {
  const [status, setStatus] = useState<WebSocketStatus>('connecting');
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [retryInSeconds, setRetryInSeconds] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const retryIntervalRef = useRef<number | null>(null);
  const retryDelayRef = useRef(INITIAL_RETRY_DELAY_MS);
  const hasConnectedRef = useRef(false);

  useEffect(() => {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${location.host}/ws`;
    let disposed = false;

    const clearRetryTimers = () => {
      if (reconnectTimeoutRef.current !== null) {
        window.clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (retryIntervalRef.current !== null) {
        window.clearInterval(retryIntervalRef.current);
        retryIntervalRef.current = null;
      }
    };

    const scheduleReconnect = () => {
      if (disposed || reconnectTimeoutRef.current !== null) {
        return;
      }

      const delayMs = retryDelayRef.current;
      const retryAt = Date.now() + delayMs;
      setStatus('reconnecting');
      setRetryInSeconds(Math.max(1, Math.ceil(delayMs / 1000)));

      retryIntervalRef.current = window.setInterval(() => {
        const secondsLeft = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
        setRetryInSeconds(secondsLeft);
      }, 1000);

      reconnectTimeoutRef.current = window.setTimeout(() => {
        clearRetryTimers();
        setRetryInSeconds(null);
        connect();
      }, delayMs);

      retryDelayRef.current = Math.min(retryDelayRef.current * 2, MAX_RETRY_DELAY_MS);
    };

    const connect = () => {
      if (disposed) {
        return;
      }

      clearRetryTimers();
      setRetryInSeconds(null);
      setStatus(hasConnectedRef.current ? 'reconnecting' : 'connecting');

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      setSocket(ws);

      ws.addEventListener('open', () => {
        if (disposed || wsRef.current !== ws) {
          return;
        }

        console.log('[shell] WebSocket connected');
        hasConnectedRef.current = true;
        retryDelayRef.current = INITIAL_RETRY_DELAY_MS;
        initMessaging(ws);
        setStatus('connected');
        setRetryInSeconds(null);
      });

      ws.addEventListener('close', () => {
        const isActiveSocket = wsRef.current === ws;

        if (!isActiveSocket) {
          return;
        }

        wsRef.current = null;
        setSocket(null);

        if (disposed) {
          return;
        }

        console.log('[shell] WebSocket disconnected');
        scheduleReconnect();
      });

      ws.addEventListener('error', (event) => {
        console.error('[shell] WebSocket error:', event);
      });
    };

    connect();

    return () => {
      disposed = true;
      clearRetryTimers();
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
      }
    };
  }, []);

  return { status, socket, retryInSeconds };
}

/**
 * Hook that tracks the desktop area size and reports it to the window manager.
 */
function useDesktopBounds(desktopRef: React.RefObject<HTMLDivElement | null>) {
  const setDesktopBounds = useWindowManager((s) => s.setDesktopBounds);

  useEffect(() => {
    const el = desktopRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDesktopBounds({ x: 0, y: 0, width, height });
      }
    });

    observer.observe(el);
    // Set initial bounds
    setDesktopBounds({
      x: 0,
      y: 0,
      width: el.clientWidth,
      height: el.clientHeight,
    });

    return () => observer.disconnect();
  }, [desktopRef, setDesktopBounds]);
}

function WindowTile({
  win,
  isOverlayMaximized = false,
}: {
  win: WindowState;
  isOverlayMaximized?: boolean;
}) {
  return (
    <WindowChrome window={win} isOverlayMaximized={isOverlayMaximized}>
      <MiniAppWindow miniAppId={win.miniAppId} windowId={win.id} args={win.args} />
    </WindowChrome>
  );
}

function TilingTreeView({
  node,
  windowsById,
  path = [],
}: {
  node: TilingNode;
  windowsById: Map<string, WindowState>;
  path?: TreePath;
}) {
  if (node.type === 'leaf') {
    const win = windowsById.get(node.windowId);
    if (!win) {
      return null;
    }

    return (
      <div className={styles.tileLeaf}>
        <WindowTile win={win} isOverlayMaximized={win.maximized} />
      </div>
    );
  }

  const [first, second] = node.children;
  const containerStyle: React.CSSProperties =
    node.split === 'horizontal'
      ? {
          gridTemplateColumns: `minmax(0, ${node.ratio}fr) ${TILE_GAP}px minmax(0, ${1 - node.ratio}fr)`,
        }
      : {
          gridTemplateRows: `minmax(0, ${node.ratio}fr) ${TILE_GAP}px minmax(0, ${1 - node.ratio}fr)`,
        };

  const splitClassName = [
    styles.tileSplit,
    node.split === 'horizontal' ? styles.tileSplitHorizontal : styles.tileSplitVertical,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={splitClassName} style={containerStyle}>
      <div className={styles.tilePane}>
        <TilingTreeView node={first} windowsById={windowsById} path={[...path, 0]} />
      </div>
      <SplitResizer path={path} split={node.split} ratio={node.ratio} />
      <div className={styles.tilePane}>
        <TilingTreeView node={second} windowsById={windowsById} path={[...path, 1]} />
      </div>
    </div>
  );
}

export function Shell() {
  const { status: connectionStatus, socket, retryInSeconds } = useWebSocket();
  const wsReady = connectionStatus === 'connected';

  const windows = useWindowManager((s) => s.windows);
  const tree = useWindowManager((s) => s.tree);
  const fullscreenWindowId = useWindowManager((s) => s.fullscreenWindowId);
  const setWindowActions = useWindowManager((s) => s.setWindowActions);

  const [manifests, setManifests] = useState<MiniAppManifest[]>([]);
  const [assistantRatio, setAssistantRatio] = useState(ASSISTANT_DEFAULT_RATIO);
  const actionHandlersRef = useRef<Map<string, Map<string, ActionHandler>>>(new Map());

  const desktopRef = useRef<HTMLDivElement>(null);
  useDesktopBounds(desktopRef);
  useKeyboardShortcuts();

  useEffect(() => {
    const handleBridgeStateRequest = (event: Event) => {
      const detail = (event as CustomEvent<BridgeStateRequestDetail>).detail;
      if (!detail?.selector) {
        return;
      }

      const store = useWindowManager.getState();
      const summarizeWindow = (windowData: WindowState) => ({
        id: windowData.id,
        miniAppId: windowData.miniAppId,
        title: windowData.title,
        focused: windowData.id === store.focusedWindowId,
        maximized: windowData.id === store.fullscreenWindowId || !!windowData.maximized,
      });

      try {
        switch (detail.selector) {
          case 'desktop.summary':
            detail.resolve({
              focusedWindowId: store.focusedWindowId,
              fullscreenWindowId: store.fullscreenWindowId,
              windows: store.windows.map(summarizeWindow),
            });
            return;
          case 'desktop.windows':
            detail.resolve(store.windows.map(summarizeWindow));
            return;
          case 'desktop.focusedWindow': {
            const focusedWindow = store.windows.find(
              (windowData) => windowData.id === store.focusedWindowId,
            );
            detail.resolve(focusedWindow ? summarizeWindow(focusedWindow) : null);
            return;
          }
          case 'theme.current': {
            const computedStyle = getComputedStyle(document.documentElement);
            const tokens = [
              '--dt-bg',
              '--dt-bg-subtle',
              '--dt-surface',
              '--dt-text',
              '--dt-text-secondary',
              '--dt-text-muted',
              '--dt-border',
              '--dt-accent',
              '--dt-danger',
              '--dt-success',
              '--dt-warning',
              '--dt-info',
            ].reduce<Record<string, string>>((acc, tokenName) => {
              acc[tokenName] = computedStyle.getPropertyValue(tokenName).trim();
              return acc;
            }, {});
            detail.resolve({
              mode: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
              tokens,
            });
            return;
          }
        }
      } catch (error) {
        detail.reject((error as Error).message);
      }
    };

    window.addEventListener('desktalk:bridge:get-state', handleBridgeStateRequest);
    return () => {
      window.removeEventListener('desktalk:bridge:get-state', handleBridgeStateRequest);
    };
  }, []);

  const windowsById = new Map(windows.map((win) => [win.id, win]));
  const fullscreenWindow = fullscreenWindowId ? windowsById.get(fullscreenWindowId) : undefined;
  const desktopRatio = 1 - assistantRatio;
  const shellLayoutStyle: React.CSSProperties = {
    gridTemplateColumns: `minmax(0, ${desktopRatio}fr) ${TILE_GAP}px minmax(0, ${assistantRatio}fr)`,
  };
  const assistantWindow: WindowState = {
    id: ASSISTANT_WINDOW_ID,
    miniAppId: 'assistant',
    title: 'AI Assistant',
    position: { x: 0, y: 0 },
    size: { width: 0, height: 0 },
    minimized: false,
    maximized: false,
    focused: false,
    zIndex: 1,
  };

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
          } & WindowSyncPayload;
          useWindowManager.getState().restoreFromBackend({
            version: 2,
            windows: payload.windows ?? [],
            tree: payload.tree ?? null,
            focusedWindowId:
              typeof payload.focusedWindowId === 'string' ? payload.focusedWindowId : null,
            fullscreenWindowId:
              typeof payload.fullscreenWindowId === 'string' ? payload.fullscreenWindowId : null,
            windowIdCounter:
              typeof payload.windowIdCounter === 'number' ? payload.windowIdCounter : 0,
            nextSplitDirection:
              payload.nextSplitDirection === 'horizontal' ||
              payload.nextSplitDirection === 'vertical' ||
              payload.nextSplitDirection === 'auto'
                ? payload.nextSplitDirection
                : 'auto',
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
          void httpClient.post(`/api/miniapps/${encodeURIComponent(miniAppId)}/activate`, { args });
          resultWindowId = store.openWindow(miniAppId, title, args);
          break;
        }
        case 'close':
          if (windowId) store.closeWindow(windowId);
          break;
        case 'focus':
          if (windowId) store.focusWindow(windowId);
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

      setWindowActions(
        customEvent.detail.windowId,
        buildClientActions(customEvent.detail.windowId, actions),
      );
    };

    window.addEventListener('desktalk:actions-changed', handleActionsChanged);
    return () => {
      window.removeEventListener('desktalk:actions-changed', handleActionsChanged);
    };
  }, [buildClientActions, setWindowActions]);

  // Listen for MiniApp requests to open another MiniApp window
  useEffect(() => {
    const handleOpenWindow = (event: Event) => {
      const { miniAppId, args } = (
        event as CustomEvent<{ miniAppId: string; args?: Record<string, unknown> }>
      ).detail;
      if (!miniAppId) return;

      void (async () => {
        try {
          await httpClient.post(`/api/miniapps/${encodeURIComponent(miniAppId)}/activate`, {
            args,
          });
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
        // Activate on server
        await httpClient.post(`/api/miniapps/${encodeURIComponent(miniAppId)}/activate`, {});
        // Find the manifest to get the title
        const manifest = manifests.find((m) => m.id === miniAppId);
        const title = manifest?.name ?? miniAppId;
        // Open locally. The store reuses an existing window when miniAppId and args
        // are shallow-equal; otherwise it creates a new window.
        useWindowManager.getState().openWindow(miniAppId, title);
      } catch (err) {
        console.error('[shell] Could not launch MiniApp:', err);
      }
    },
    [manifests],
  );

  return (
    <div className={styles.shell}>
      <ConnectionOverlay status={connectionStatus} retryInSeconds={retryInSeconds} />

      <div className={styles.actionsBar}>
        <ActionsBar manifests={manifests} onLaunch={handleLaunch} />
      </div>

      <div className={styles.content} style={shellLayoutStyle}>
        <div ref={desktopRef} className={styles.desktop}>
          {wsReady ? tree && <TilingTreeView node={tree} windowsById={windowsById} /> : null}
        </div>

        <SplitResizer
          path={[]}
          split="horizontal"
          ratio={desktopRatio}
          onRatioChange={(nextDesktopRatio) => {
            setAssistantRatio(clampAssistantRatio(1 - nextDesktopRatio));
          }}
        />

        <div className={styles.assistantPane}>
          <WindowChrome
            window={assistantWindow}
            title="AI Assistant"
            showCloseButton={false}
            showFullscreenButton={false}
          >
            <InfoPanel socket={socket} wsReady={wsReady} />
          </WindowChrome>
        </div>

        {fullscreenWindow && <div className={styles.maximizedMask} />}
      </div>
    </div>
  );
}
