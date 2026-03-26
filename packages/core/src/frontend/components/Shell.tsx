import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useEventListener } from 'ahooks';
import type { MiniAppManifest, WindowState } from '@desktalk/sdk';
import type { ActionDefinition } from '@desktalk/sdk';
import { reportWindowActions, useWindowManager } from '../stores/window-manager';
import { ActionsBar } from './ActionsBar';
import { ConnectionOverlay } from './ConnectionOverlay';
import { SplitResizer } from './SplitResizer';
import { DropZoneOverlay } from './DropZoneOverlay';
import { InfoPanel } from './InfoPanel';
import { CompactInfoPanel } from './CompactInfoPanel';
import { WindowChrome } from './WindowChrome';
import { useWebSocket } from './useWebSocket';
import { TilingTreeView } from './TilingTreeView';
import { useBridgeState } from './useBridgeState';
import { useWindowSync } from './useWindowSync';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { useDragStore } from '../stores/drag-store';
import { httpClient } from '../http-client';
import type { ThemePreferences } from '../theme';
import { HTML_FORM_CONTROLS_STYLESHEET } from '../theme';
import type { LauncherApp, LiveAppRecord } from './launcher-types';
import styles from './Shell.module.scss';

const TILE_GAP = 4;
const ASSISTANT_MIN_RATIO = 0.18;
const ASSISTANT_MAX_RATIO = 0.45;
const ASSISTANT_DEFAULT_RATIO = 0.28;
const ASSISTANT_WINDOW_ID = '__assistant__';
const SHELL_FORM_STYLE_ID = 'dt-shell-form-controls';
const SHELL_SCOPE_SELECTOR = '[data-dt-shell]';

function clampAssistantRatio(ratio: number): number {
  return Math.min(Math.max(ratio, ASSISTANT_MIN_RATIO), ASSISTANT_MAX_RATIO);
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

export function Shell({ themePreferences }: { themePreferences: ThemePreferences }) {
  const { status: connectionStatus, socket, retryInSeconds } = useWebSocket();
  const wsReady = connectionStatus === 'connected';

  const windows = useWindowManager((s) => s.windows);
  const tree = useWindowManager((s) => s.tree);
  const fullscreenWindowId = useWindowManager((s) => s.fullscreenWindowId);
  const setWindowActions = useWindowManager((s) => s.setWindowActions);

  const isDragging = useDragStore((s) => s.isDragging);

  const [manifests, setManifests] = useState<MiniAppManifest[]>([]);
  const [liveApps, setLiveApps] = useState<LiveAppRecord[]>([]);
  const [assistantRatio, setAssistantRatio] = useState(ASSISTANT_DEFAULT_RATIO);
  const { actionHandlersRef, buildClientActions } = useWindowSync(socket);

  const desktopRef = useRef<HTMLDivElement>(null);
  useDesktopBounds(desktopRef);
  useKeyboardShortcuts();
  useBridgeState();

  useEffect(() => {
    let styleEl = document.getElementById(SHELL_FORM_STYLE_ID) as HTMLStyleElement | null;

    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = SHELL_FORM_STYLE_ID;
      document.head.appendChild(styleEl);
    }

    styleEl.textContent = HTML_FORM_CONTROLS_STYLESHEET.replaceAll(
      'input[type="',
      `${SHELL_SCOPE_SELECTOR} input[type="`,
    );

    return () => {
      styleEl?.remove();
    };
  }, []);

  // Detect clicks inside iframes for focus tracking.
  // When an iframe receives focus the parent window blurs.  At that moment
  // document.activeElement points to the <iframe> element.  We walk up from
  // it to find the ancestor WindowChrome (via data-window-id) and focus the
  // corresponding window in the store.
  useEventListener('blur', () => {
    // Use a rAF so the browser has time to update document.activeElement
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (!active || active.tagName !== 'IFRAME') return;

      const chromeEl = active.closest<HTMLElement>('[data-window-id]');
      if (!chromeEl) return;

      const windowId = chromeEl.dataset.windowId;
      if (!windowId) return;

      const state = useWindowManager.getState();
      if (state.focusedWindowId !== windowId) {
        state.focusWindow(windowId);
      }
    });
  });

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

  const loadLiveApps = useCallback(async () => {
    try {
      const response = await httpClient.get<LiveAppRecord[]>('/api/liveapps');
      setLiveApps(response.data);
    } catch (error) {
      console.error('[shell] Could not load LiveApps:', error);
    }
  }, []);

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

      try {
        const response = await httpClient.get<LiveAppRecord[]>('/api/liveapps');
        if (!cancelled) {
          setLiveApps(response.data);
        }
      } catch (error) {
        console.error('[shell] Could not load LiveApps:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEventListener('desktalk:event', (event: Event) => {
    const detail = (event as CustomEvent<{ event: string | null }>).detail;
    if (detail?.event === 'liveapps.changed') {
      void loadLiveApps();
    }
  });

  const launcherApps: LauncherApp[] = [
    ...manifests.map((manifest) => ({
      id: `miniapp:${manifest.id}`,
      name: manifest.name,
      icon: manifest.icon,
      iconPng: manifest.iconPng,
      kind: 'miniapp' as const,
      miniAppId: manifest.id,
    })),
    ...liveApps.map((app) => ({
      id: `liveapp:${app.id}`,
      name: app.name,
      icon: app.icon,
      iconPng: app.iconPng,
      kind: 'liveapp' as const,
      miniAppId: 'preview',
      args: { path: app.path, liveAppId: app.id },
    })),
  ].sort((a, b) => a.name.localeCompare(b.name));

  // Listen for MiniApp action registrations from within windows
  useEventListener('desktalk:actions-changed', (event: Event) => {
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
  });

  // Listen for MiniApp requests to open another MiniApp window
  useEventListener('desktalk:open-window', (event: Event) => {
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
  });

  const handleLaunch = useCallback(async (app: LauncherApp) => {
    try {
      const launchArgs =
        app.kind === 'liveapp'
          ? {
              ...(app.args ?? {}),
              bridgeToken: crypto.randomUUID(),
            }
          : app.args;

      await httpClient.post(`/api/miniapps/${encodeURIComponent(app.miniAppId)}/activate`, {
        args: launchArgs,
      });
      useWindowManager.getState().openWindow(app.miniAppId, app.name, launchArgs);
    } catch (err) {
      console.error('[shell] Could not launch application:', err);
    }
  }, []);

  return (
    <div className={styles.shell} data-dt-shell>
      <ConnectionOverlay status={connectionStatus} retryInSeconds={retryInSeconds} />

      <div className={styles.actionsBar}>
        <ActionsBar apps={launcherApps} onLaunch={handleLaunch} />
      </div>

      <div className={styles.content} style={shellLayoutStyle}>
        <div ref={desktopRef} className={styles.desktop}>
          {wsReady
            ? tree && (
                <TilingTreeView
                  node={tree}
                  windowsById={windowsById}
                  themePreferences={themePreferences}
                  canDrag={tree.type === 'container'}
                />
              )
            : null}
          {isDragging && <DropZoneOverlay desktopRef={desktopRef} />}
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

        {fullscreenWindow && <CompactInfoPanel socket={socket} wsReady={wsReady} />}
      </div>
    </div>
  );
}
