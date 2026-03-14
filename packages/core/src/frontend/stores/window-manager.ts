import { create } from 'zustand';
import type { ActionDefinition, WindowPosition, WindowSize, WindowState } from '@desktalk/sdk';

const MIN_WINDOW_WIDTH = 300;
const MIN_WINDOW_HEIGHT = 200;

/**
 * Snapshot sent to backend for persistence and AI context.
 */
export interface WindowSyncPayload {
  windows: WindowState[];
  nextZIndex: number;
  windowIdCounter: number;
}

let windowManagerSocket: WebSocket | null = null;

function sendWindowMessage(message: Record<string, unknown>): void {
  if (!windowManagerSocket || windowManagerSocket.readyState !== WebSocket.OPEN) {
    return;
  }
  windowManagerSocket.send(JSON.stringify(message));
}

/**
 * Send the full window state to the backend for persistence.
 * Called after every local mutation.
 */
function syncToBackend(): void {
  const state = useWindowManager.getState();
  const payload: WindowSyncPayload = {
    windows: state.windows,
    nextZIndex: state.nextZIndex,
    windowIdCounter: state.windowIdCounter,
  };
  sendWindowMessage({ type: 'window:sync', ...payload });
}

export function setWindowManagerSocket(socket: WebSocket | null): void {
  windowManagerSocket = socket;
}

/**
 * Report window actions to the backend so the AI system prompt stays current.
 */
export function reportWindowActions(
  windowId: string,
  actions: Array<Pick<ActionDefinition, 'name' | 'description' | 'params'>>,
): void {
  sendWindowMessage({ type: 'window:actions_changed', windowId, actions });
}

export function reportWindowActionResult(
  requestId: string,
  result?: unknown,
  error?: string,
): void {
  sendWindowMessage({ type: 'window:action_result', requestId, result, error });
}

interface WindowManagerState {
  windows: WindowState[];
  nextZIndex: number;
  windowIdCounter: number;
  focusedWindowActions: ActionDefinition[];
  windowActions: Record<string, ActionDefinition[]>;

  // Mutations (execute locally, then sync to backend)
  openWindow: (miniAppId: string, title: string) => string;
  closeWindow: (windowId: string) => void;
  focusWindow: (windowId: string) => void;
  minimizeWindow: (windowId: string) => void;
  maximizeWindow: (windowId: string) => void;
  moveWindow: (windowId: string, position: WindowPosition) => void;
  resizeWindow: (windowId: string, size: WindowSize) => void;

  // Action management
  setFocusedWindowActions: (actions: ActionDefinition[]) => void;
  setWindowActions: (windowId: string, actions: ActionDefinition[]) => void;

  // Queries
  getFocusedWindow: () => WindowState | undefined;
  getWindowsByMiniApp: (miniAppId: string) => WindowState[];

  // Restore persisted state from backend on initial connect
  restoreFromBackend: (payload: WindowSyncPayload) => void;
}

export const useWindowManager = create<WindowManagerState>((set, get) => ({
  windows: [],
  nextZIndex: 1,
  windowIdCounter: 0,
  focusedWindowActions: [],
  windowActions: {},

  openWindow(miniAppId: string, title: string): string {
    const state = get();
    const windowIdCounter = state.windowIdCounter + 1;
    const id = `win-${windowIdCounter}`;
    const offset = (state.windows.length % 10) * 30;

    const newWindow: WindowState = {
      id,
      miniAppId,
      title,
      position: { x: 100 + offset, y: 80 + offset },
      size: { width: 800, height: 600 },
      minimized: false,
      maximized: false,
      focused: true,
      zIndex: state.nextZIndex,
    };

    const updatedWindows = state.windows.map((w) => ({ ...w, focused: false }));

    set({
      windows: [...updatedWindows, newWindow],
      nextZIndex: state.nextZIndex + 1,
      windowIdCounter,
      focusedWindowActions: [],
    });

    syncToBackend();
    return id;
  },

  closeWindow(windowId: string) {
    const state = get();
    const remaining = state.windows.filter((w) => w.id !== windowId);

    if (remaining.length > 0) {
      const visible = remaining.filter((w) => !w.minimized);
      const topWindow =
        visible.length > 0
          ? visible.reduce((top, w) => (w.zIndex > top.zIndex ? w : top))
          : undefined;
      const updated = remaining.map((w) => ({
        ...w,
        focused: topWindow ? w.id === topWindow.id : false,
      }));
      const { [windowId]: _, ...remainingActions } = state.windowActions;
      set({
        windows: updated,
        windowActions: remainingActions,
        focusedWindowActions: topWindow ? (remainingActions[topWindow.id] ?? []) : [],
      });
    } else {
      set({ windows: [], focusedWindowActions: [], windowActions: {} });
    }

    syncToBackend();
  },

  focusWindow(windowId: string) {
    const state = get();
    const target = state.windows.find((w) => w.id === windowId);
    if (!target) return;

    const updated = state.windows.map((w) => ({
      ...w,
      focused: w.id === windowId,
      zIndex: w.id === windowId ? state.nextZIndex : w.zIndex,
      minimized: w.id === windowId ? false : w.minimized,
    }));

    set({
      windows: updated,
      nextZIndex: state.nextZIndex + 1,
      focusedWindowActions: state.windowActions[windowId] ?? [],
    });

    syncToBackend();
  },

  minimizeWindow(windowId: string) {
    const state = get();
    const target = state.windows.find((w) => w.id === windowId);
    if (!target) return;

    const updated = state.windows.map((w) => {
      if (w.id !== windowId) return w;
      return { ...w, minimized: true, focused: false };
    });

    const visible = updated.filter((w) => !w.minimized);
    if (visible.length > 0) {
      const topWindow = visible.reduce((top, w) => (w.zIndex > top.zIndex ? w : top));
      const final = updated.map((w) => ({
        ...w,
        focused: w.id === topWindow.id,
      }));
      set({
        windows: final,
        focusedWindowActions: state.windowActions[topWindow.id] ?? [],
      });
    } else {
      set({ windows: updated, focusedWindowActions: [] });
    }

    syncToBackend();
  },

  maximizeWindow(windowId: string) {
    const state = get();
    const target = state.windows.find((w) => w.id === windowId);
    if (!target) return;

    set({
      windows: state.windows.map((w) => {
        if (w.id !== windowId) return w;
        return { ...w, maximized: !w.maximized };
      }),
    });

    syncToBackend();
  },

  moveWindow(windowId: string, position: WindowPosition) {
    set((state) => ({
      windows: state.windows.map((w) => {
        if (w.id !== windowId) return w;
        return { ...w, position };
      }),
    }));

    syncToBackend();
  },

  resizeWindow(windowId: string, size: WindowSize) {
    set((state) => ({
      windows: state.windows.map((w) => {
        if (w.id !== windowId) return w;
        return {
          ...w,
          size: {
            width: Math.max(size.width, MIN_WINDOW_WIDTH),
            height: Math.max(size.height, MIN_WINDOW_HEIGHT),
          },
        };
      }),
    }));

    syncToBackend();
  },

  setFocusedWindowActions(actions: ActionDefinition[]) {
    set({ focusedWindowActions: actions });
  },

  setWindowActions(windowId: string, actions: ActionDefinition[]) {
    set((state) => {
      const nextWindowActions = {
        ...state.windowActions,
        [windowId]: actions,
      };
      const focusedWindow = state.windows.find((w) => w.focused);
      return {
        windowActions: nextWindowActions,
        focusedWindowActions: focusedWindow?.id === windowId ? actions : state.focusedWindowActions,
      };
    });
  },

  getFocusedWindow(): WindowState | undefined {
    return get().windows.find((w) => w.focused);
  },

  getWindowsByMiniApp(miniAppId: string): WindowState[] {
    return get().windows.filter((w) => w.miniAppId === miniAppId);
  },

  restoreFromBackend(payload: WindowSyncPayload) {
    set({
      windows: payload.windows,
      nextZIndex: payload.nextZIndex,
      windowIdCounter: payload.windowIdCounter,
    });
  },
}));
