import { create } from 'zustand';
import type { WindowState, WindowPosition, WindowSize } from '@desktalk/sdk';
import type { ActionDefinition } from '@desktalk/sdk';

interface WindowManagerState {
  windows: WindowState[];
  nextZIndex: number;
  /** Actions registered by the focused window's MiniApp */
  focusedWindowActions: ActionDefinition[];
  windowActions: Record<string, ActionDefinition[]>;

  // Actions
  openWindow: (miniAppId: string, title: string) => string;
  closeWindow: (windowId: string) => void;
  focusWindow: (windowId: string) => void;
  minimizeWindow: (windowId: string) => void;
  maximizeWindow: (windowId: string) => void;
  moveWindow: (windowId: string, position: WindowPosition) => void;
  resizeWindow: (windowId: string, size: WindowSize) => void;
  setFocusedWindowActions: (actions: ActionDefinition[]) => void;
  setWindowActions: (windowId: string, actions: ActionDefinition[]) => void;
  getFocusedWindow: () => WindowState | undefined;
  getWindowsByMiniApp: (miniAppId: string) => WindowState[];
}

let windowIdCounter = 0;

export const useWindowManager = create<WindowManagerState>((set, get) => ({
  windows: [],
  nextZIndex: 1,
  focusedWindowActions: [],
  windowActions: {},

  openWindow(miniAppId: string, title: string): string {
    const id = `win-${++windowIdCounter}`;
    const state = get();

    // Cascade new windows slightly offset
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

    // Unfocus all existing windows
    const updatedWindows = state.windows.map((w) => ({ ...w, focused: false }));

    set({
      windows: [...updatedWindows, newWindow],
      nextZIndex: state.nextZIndex + 1,
      focusedWindowActions: [],
    });

    return id;
  },

  closeWindow(windowId: string) {
    const state = get();
    const remaining = state.windows.filter((w) => w.id !== windowId);

    // Focus the topmost remaining window
    if (remaining.length > 0) {
      const topWindow = remaining.reduce((top, w) => (w.zIndex > top.zIndex ? w : top));
      const updated = remaining.map((w) => ({
        ...w,
        focused: w.id === topWindow.id,
      }));
      const { [windowId]: _, ...remainingActions } = state.windowActions;
      set({
        windows: updated,
        windowActions: remainingActions,
        focusedWindowActions: remainingActions[topWindow.id] ?? [],
      });
    } else {
      set({ windows: [], focusedWindowActions: [], windowActions: {} });
    }
  },

  focusWindow(windowId: string) {
    const state = get();
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
  },

  minimizeWindow(windowId: string) {
    const state = get();
    const updated = state.windows.map((w) => {
      if (w.id !== windowId) return w;
      return { ...w, minimized: true, focused: false };
    });

    // Focus the next topmost non-minimized window
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
  },

  maximizeWindow(windowId: string) {
    set((state) => ({
      windows: state.windows.map((w) => {
        if (w.id !== windowId) return w;
        return { ...w, maximized: !w.maximized };
      }),
    }));
  },

  moveWindow(windowId: string, position: WindowPosition) {
    set((state) => ({
      windows: state.windows.map((w) => {
        if (w.id !== windowId) return w;
        return { ...w, position };
      }),
    }));
  },

  resizeWindow(windowId: string, size: WindowSize) {
    set((state) => ({
      windows: state.windows.map((w) => {
        if (w.id !== windowId) return w;
        return { ...w, size };
      }),
    }));
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
}));
