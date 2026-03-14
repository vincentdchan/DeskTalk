import { create } from 'zustand';
import type { ActionDefinition, WindowPosition, WindowSize, WindowState } from '@desktalk/sdk';

const MIN_WINDOW_WIDTH = 300;
const MIN_WINDOW_HEIGHT = 200;

export interface WindowManagerSnapshot {
  windows: WindowState[];
  focusedWindowActions: ActionDefinition[];
}

let windowManagerSocket: WebSocket | null = null;

function sendWindowMessage(message: Record<string, unknown>): void {
  if (!windowManagerSocket || windowManagerSocket.readyState !== WebSocket.OPEN) {
    return;
  }
  windowManagerSocket.send(JSON.stringify(message));
}

export function setWindowManagerSocket(socket: WebSocket | null): void {
  windowManagerSocket = socket;
}

export function requestOpen(miniAppId: string): void {
  sendWindowMessage({ type: 'window:open', miniAppId });
}

export function requestClose(windowId: string): void {
  sendWindowMessage({ type: 'window:close', windowId });
}

export function requestFocus(windowId: string): void {
  sendWindowMessage({ type: 'window:focus', windowId });
}

export function requestMinimize(windowId: string): void {
  sendWindowMessage({ type: 'window:minimize', windowId });
}

export function requestMaximize(windowId: string): void {
  sendWindowMessage({ type: 'window:maximize', windowId });
}

export function requestMove(windowId: string, position: WindowPosition): void {
  sendWindowMessage({ type: 'window:move', windowId, position });
}

export function requestResize(windowId: string, size: WindowSize): void {
  sendWindowMessage({ type: 'window:resize', windowId, size });
}

export function optimisticMove(windowId: string, position: WindowPosition): void {
  useWindowManager.getState().optimisticMove(windowId, position);
}

export function optimisticResize(windowId: string, size: WindowSize): void {
  useWindowManager.getState().optimisticResize(windowId, size);
}

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
  focusedWindowActions: ActionDefinition[];
  replaceState: (snapshot: WindowManagerSnapshot) => void;
  setFocusedWindowActions: (actions: ActionDefinition[]) => void;
  optimisticMove: (windowId: string, position: WindowPosition) => void;
  optimisticResize: (windowId: string, size: WindowSize) => void;
  getFocusedWindow: () => WindowState | undefined;
  getWindowsByMiniApp: (miniAppId: string) => WindowState[];
}

export const useWindowManager = create<WindowManagerState>((set, get) => ({
  windows: [],
  focusedWindowActions: [],

  replaceState(snapshot: WindowManagerSnapshot) {
    set({
      windows: snapshot.windows,
      focusedWindowActions: snapshot.focusedWindowActions,
    });
  },

  setFocusedWindowActions(actions: ActionDefinition[]) {
    set({ focusedWindowActions: actions });
  },

  optimisticMove(windowId: string, position: WindowPosition) {
    set((state) => ({
      windows: state.windows.map((window) =>
        window.id === windowId ? { ...window, position } : window,
      ),
    }));
  },

  optimisticResize(windowId: string, size: WindowSize) {
    set((state) => ({
      windows: state.windows.map((window) =>
        window.id === windowId
          ? {
              ...window,
              size: {
                width: Math.max(size.width, MIN_WINDOW_WIDTH),
                height: Math.max(size.height, MIN_WINDOW_HEIGHT),
              },
            }
          : window,
      ),
    }));
  },

  getFocusedWindow(): WindowState | undefined {
    return get().windows.find((window) => window.focused);
  },

  getWindowsByMiniApp(miniAppId: string): WindowState[] {
    return get().windows.filter((window) => window.miniAppId === miniAppId);
  },
}));
