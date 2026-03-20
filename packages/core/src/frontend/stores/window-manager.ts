import { create } from 'zustand';
import type { ActionDefinition, WindowPosition, WindowSize, WindowState } from '@desktalk/sdk';
import type { TilingNode } from '../tiling-tree';
import {
  computeLayout,
  computeSplitBars,
  getLeafIds,
  insertWindow,
  removeWindow,
  swapWindows,
  adjustRatio,
  equalizeRatio,
  rotateSplit,
  findNeighbor,
  containsWindow,
  setRatioAtPath,
  relocateWindow as relocateWindowInTree,
} from '../tiling-tree';
import type { TileRect, Direction, SplitBar, TreePath, DropEdge } from '../tiling-tree';

const TILE_GAP = 4;

/**
 * Snapshot sent to backend for persistence and AI context.
 */
export interface PersistedWindow {
  id: string;
  miniAppId: string;
  title: string;
  args?: Record<string, unknown>;
}

export interface WindowSyncPayload {
  version: 2;
  windows: PersistedWindow[];
  tree: TilingNode | null;
  focusedWindowId: string | null;
  fullscreenWindowId: string | null;
  windowIdCounter: number;
  nextSplitDirection: 'horizontal' | 'vertical' | 'auto';
}

function toPersistedWindow(window: WindowState): PersistedWindow {
  return {
    id: window.id,
    miniAppId: window.miniAppId,
    title: window.title,
    args: window.args,
  };
}

function toWindowState(window: PersistedWindow): WindowState {
  return {
    id: window.id,
    miniAppId: window.miniAppId,
    title: window.title,
    position: { x: 0, y: 0 },
    size: { width: 0, height: 0 },
    minimized: false,
    maximized: false,
    focused: false,
    zIndex: 1,
    args: window.args,
  };
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
    version: 2,
    windows: state.windows.map(toPersistedWindow),
    tree: state.tree,
    focusedWindowId: state.focusedWindowId,
    fullscreenWindowId: state.fullscreenWindowId,
    windowIdCounter: state.windowIdCounter,
    nextSplitDirection: state.nextSplitDirection,
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
  windowIdCounter: number;
  focusedWindowActions: ActionDefinition[];
  windowActions: Record<string, ActionDefinition[]>;

  // Tiling state
  tree: TilingNode | null;
  focusedWindowId: string | null;
  fullscreenWindowId: string | null;
  nextSplitDirection: 'horizontal' | 'vertical' | 'auto';

  // Cached layout rects (recomputed after every tree mutation)
  tileRects: TileRect[];
  splitBars: SplitBar[];
  desktopBounds: { x: number; y: number; width: number; height: number };

  // Mutations
  openWindow: (miniAppId: string, title: string, args?: Record<string, unknown>) => string;
  closeWindow: (windowId: string) => void;
  focusWindow: (windowId: string) => void;
  maximizeWindow: (windowId: string) => void;
  moveWindow: (windowId: string, position: WindowPosition) => void;
  resizeWindow: (windowId: string, size: WindowSize) => void;

  // Tiling-specific mutations
  focusDirection: (direction: Direction) => void;
  swapDirection: (direction: Direction) => void;
  toggleFullscreen: () => void;
  setNextSplitDirection: (direction: 'horizontal' | 'vertical' | 'auto') => void;
  rotateFocusedSplit: () => void;
  adjustFocusedRatio: (delta: number) => void;
  equalizeFocusedRatio: () => void;
  focusNth: (n: number) => void;
  setDesktopBounds: (bounds: { x: number; y: number; width: number; height: number }) => void;
  setNodeRatio: (path: TreePath, ratio: number) => void;
  relocateWindow: (sourceWindowId: string, targetWindowId: string, edge: DropEdge) => void;

  // Action management
  setFocusedWindowActions: (actions: ActionDefinition[]) => void;
  setWindowActions: (windowId: string, actions: ActionDefinition[]) => void;

  // Queries
  getFocusedWindow: () => WindowState | undefined;
  getWindowsByMiniApp: (miniAppId: string, args?: Record<string, unknown>) => WindowState[];

  // Restore persisted state from backend on initial connect
  restoreFromBackend: (payload: WindowSyncPayload) => void;
}

function recomputeLayout(
  tree: TilingNode | null,
  bounds: { x: number; y: number; width: number; height: number },
): { rects: TileRect[]; bars: SplitBar[] } {
  if (!tree) return { rects: [], bars: [] };
  return {
    rects: computeLayout(tree, bounds, TILE_GAP),
    bars: computeSplitBars(tree, bounds, TILE_GAP),
  };
}

function updateWindowRectsFromTree(
  windows: WindowState[],
  rects: TileRect[],
  focusedWindowId: string | null,
  fullscreenWindowId: string | null,
): WindowState[] {
  const rectMap = new Map(rects.map((r) => [r.windowId, r]));
  return windows.map((w) => {
    const rect = rectMap.get(w.id);
    return {
      ...w,
      focused: w.id === focusedWindowId,
      maximized: w.id === fullscreenWindowId,
      position: rect ? { x: rect.x, y: rect.y } : w.position,
      size: rect ? { width: rect.width, height: rect.height } : w.size,
      zIndex: w.id === fullscreenWindowId ? 9999 : 1,
    };
  });
}

function normalizeWindowArgs(args?: Record<string, unknown>): Record<string, unknown> {
  return args ?? {};
}

function shallowEqualWindowArgs(
  left?: Record<string, unknown>,
  right?: Record<string, unknown>,
): boolean {
  const normalizedLeft = normalizeWindowArgs(left);
  const normalizedRight = normalizeWindowArgs(right);
  const leftKeys = Object.keys(normalizedLeft);
  const rightKeys = Object.keys(normalizedRight);

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key) => normalizedLeft[key] === normalizedRight[key]);
}

export const useWindowManager = create<WindowManagerState>((set, get) => ({
  windows: [],
  windowIdCounter: 0,
  focusedWindowActions: [],
  windowActions: {},

  // Tiling state
  tree: null,
  focusedWindowId: null,
  fullscreenWindowId: null,
  nextSplitDirection: 'auto',
  tileRects: [],
  splitBars: [],
  desktopBounds: { x: 0, y: 0, width: 800, height: 600 },

  openWindow(miniAppId: string, title: string, args?: Record<string, unknown>): string {
    const state = get();

    // Re-focus if the same MiniApp already has a window for the same shallow-equal args.
    const existingWindow = state.windows
      .filter((w) => w.miniAppId === miniAppId && shallowEqualWindowArgs(w.args, args))
      .reduce<
        WindowState | undefined
      >((top, w) => (!top || w.id === state.focusedWindowId ? w : top), undefined);

    if (existingWindow) {
      const newFullscreen =
        state.fullscreenWindowId === existingWindow.id ? state.fullscreenWindowId : null;
      const { rects, bars } = recomputeLayout(state.tree, state.desktopBounds);
      const updatedWindows = updateWindowRectsFromTree(
        state.windows.map((w) => (w.id === existingWindow.id && args ? { ...w, args } : w)),
        rects,
        existingWindow.id,
        newFullscreen,
      );

      set({
        windows: updatedWindows,
        focusedWindowId: existingWindow.id,
        fullscreenWindowId: newFullscreen,
        tileRects: rects,
        splitBars: bars,
        focusedWindowActions: state.windowActions[existingWindow.id] ?? [],
      });

      syncToBackend();

      return existingWindow.id;
    }

    const windowIdCounter = state.windowIdCounter + 1;
    const id = `win-${windowIdCounter}`;

    const newWindow: WindowState = {
      id,
      miniAppId,
      title,
      position: { x: 0, y: 0 },
      size: { width: 0, height: 0 },
      minimized: false,
      maximized: false,
      focused: true,
      zIndex: 1,
      args,
    };

    // Insert into tiling tree
    let newTree: TilingNode;
    if (!state.tree) {
      newTree = { type: 'leaf', windowId: id };
    } else if (state.focusedWindowId && containsWindow(state.tree, state.focusedWindowId)) {
      newTree = insertWindow(state.tree, state.focusedWindowId, id, state.nextSplitDirection);
    } else {
      // Focus lost or focused window not in tree — split the first leaf
      const leafIds = getLeafIds(state.tree);
      newTree = insertWindow(state.tree, leafIds[0], id, state.nextSplitDirection);
    }

    const { rects, bars } = recomputeLayout(newTree, state.desktopBounds);
    const allWindows = [...state.windows, newWindow];
    const updatedWindows = updateWindowRectsFromTree(allWindows, rects, id, null);

    set({
      windows: updatedWindows,
      windowIdCounter,
      tree: newTree,
      focusedWindowId: id,
      fullscreenWindowId: null,
      nextSplitDirection: 'auto',
      tileRects: rects,
      splitBars: bars,
      focusedWindowActions: [],
    });

    syncToBackend();
    return id;
  },

  closeWindow(windowId: string) {
    const state = get();
    const remaining = state.windows.filter((w) => w.id !== windowId);
    const { [windowId]: _, ...remainingActions } = state.windowActions;

    const newTree = state.tree ? removeWindow(state.tree, windowId) : null;

    // Determine new focus
    let newFocusId: string | null = null;
    if (state.focusedWindowId === windowId) {
      if (newTree) {
        const leafIds = getLeafIds(newTree);
        newFocusId = leafIds.length > 0 ? leafIds[0] : null;
      }
    } else {
      newFocusId = state.focusedWindowId;
    }

    const newFullscreen = state.fullscreenWindowId === windowId ? null : state.fullscreenWindowId;

    const { rects, bars } = recomputeLayout(newTree, state.desktopBounds);
    const updatedWindows = updateWindowRectsFromTree(remaining, rects, newFocusId, newFullscreen);

    set({
      windows: updatedWindows,
      tree: newTree,
      focusedWindowId: newFocusId,
      fullscreenWindowId: newFullscreen,
      windowActions: remainingActions,
      focusedWindowActions: newFocusId ? (remainingActions[newFocusId] ?? []) : [],
      tileRects: rects,
      splitBars: bars,
    });

    syncToBackend();
  },

  focusWindow(windowId: string) {
    const state = get();
    const target = state.windows.find((w) => w.id === windowId);
    if (!target) return;

    const newTree = state.tree ?? ({ type: 'leaf', windowId } as TilingNode);

    const { rects, bars } = recomputeLayout(newTree, state.desktopBounds);
    const updatedWindows = updateWindowRectsFromTree(
      state.windows,
      rects,
      windowId,
      state.fullscreenWindowId,
    );

    set({
      windows: updatedWindows,
      tree: newTree,
      focusedWindowId: windowId,
      tileRects: rects,
      splitBars: bars,
      focusedWindowActions: state.windowActions[windowId] ?? [],
    });

    syncToBackend();
  },

  maximizeWindow(windowId: string) {
    // Repurposed: toggle fullscreen
    const state = get();
    const target = state.windows.find((w) => w.id === windowId);
    if (!target) return;

    const newFullscreen = state.fullscreenWindowId === windowId ? null : windowId;
    const { rects, bars } = recomputeLayout(state.tree, state.desktopBounds);
    const updatedWindows = updateWindowRectsFromTree(
      state.windows,
      rects,
      state.focusedWindowId,
      newFullscreen,
    );

    set({
      windows: updatedWindows,
      fullscreenWindowId: newFullscreen,
      tileRects: rects,
      splitBars: bars,
    });

    syncToBackend();
  },

  // These are kept for API compatibility but are no-ops in tiling mode
  moveWindow(_windowId: string, _position: WindowPosition) {
    // No-op in tiling mode — positions are computed from the tree
  },

  resizeWindow(_windowId: string, _size: WindowSize) {
    // No-op in tiling mode — sizes are computed from the tree
  },

  // ─── Tiling-specific mutations ────────────────────────────────────────────

  focusDirection(direction: Direction) {
    const state = get();
    if (!state.focusedWindowId || !state.tree) return;

    const rects = state.tileRects;
    const neighborId = findNeighbor(rects, state.focusedWindowId, direction);
    if (!neighborId) return;

    const updatedWindows = updateWindowRectsFromTree(
      state.windows,
      rects,
      neighborId,
      state.fullscreenWindowId,
    );

    set({
      windows: updatedWindows,
      focusedWindowId: neighborId,
      fullscreenWindowId: null, // Exit fullscreen on directional navigation
      focusedWindowActions: state.windowActions[neighborId] ?? [],
    });

    syncToBackend();
  },

  swapDirection(direction: Direction) {
    const state = get();
    if (!state.focusedWindowId || !state.tree) return;

    const rects = state.tileRects;
    const neighborId = findNeighbor(rects, state.focusedWindowId, direction);
    if (!neighborId) return;

    const newTree = swapWindows(state.tree, state.focusedWindowId, neighborId);
    const { rects: newRects, bars } = recomputeLayout(newTree, state.desktopBounds);
    const updatedWindows = updateWindowRectsFromTree(
      state.windows,
      newRects,
      state.focusedWindowId,
      state.fullscreenWindowId,
    );

    set({
      windows: updatedWindows,
      tree: newTree,
      tileRects: newRects,
      splitBars: bars,
    });

    syncToBackend();
  },

  toggleFullscreen() {
    const state = get();
    if (!state.focusedWindowId) return;
    get().maximizeWindow(state.focusedWindowId);
  },

  setNextSplitDirection(direction: 'horizontal' | 'vertical' | 'auto') {
    set({ nextSplitDirection: direction });
    syncToBackend();
  },

  rotateFocusedSplit() {
    const state = get();
    if (!state.focusedWindowId || !state.tree) return;

    const newTree = rotateSplit(state.tree, state.focusedWindowId);
    const { rects, bars } = recomputeLayout(newTree, state.desktopBounds);
    const updatedWindows = updateWindowRectsFromTree(
      state.windows,
      rects,
      state.focusedWindowId,
      state.fullscreenWindowId,
    );

    set({
      windows: updatedWindows,
      tree: newTree,
      tileRects: rects,
      splitBars: bars,
    });

    syncToBackend();
  },

  adjustFocusedRatio(delta: number) {
    const state = get();
    if (!state.focusedWindowId || !state.tree) return;

    const newTree = adjustRatio(state.tree, state.focusedWindowId, delta);
    const { rects, bars } = recomputeLayout(newTree, state.desktopBounds);
    const updatedWindows = updateWindowRectsFromTree(
      state.windows,
      rects,
      state.focusedWindowId,
      state.fullscreenWindowId,
    );

    set({
      windows: updatedWindows,
      tree: newTree,
      tileRects: rects,
      splitBars: bars,
    });

    syncToBackend();
  },

  equalizeFocusedRatio() {
    const state = get();
    if (!state.focusedWindowId || !state.tree) return;

    const newTree = equalizeRatio(state.tree, state.focusedWindowId);
    const { rects, bars } = recomputeLayout(newTree, state.desktopBounds);
    const updatedWindows = updateWindowRectsFromTree(
      state.windows,
      rects,
      state.focusedWindowId,
      state.fullscreenWindowId,
    );

    set({
      windows: updatedWindows,
      tree: newTree,
      tileRects: rects,
      splitBars: bars,
    });

    syncToBackend();
  },

  focusNth(n: number) {
    const state = get();
    if (!state.tree) return;

    const leafIds = getLeafIds(state.tree);
    const index = n - 1; // 1-indexed
    if (index < 0 || index >= leafIds.length) return;

    const targetId = leafIds[index];
    const updatedWindows = updateWindowRectsFromTree(
      state.windows,
      state.tileRects,
      targetId,
      null, // Exit fullscreen
    );

    set({
      windows: updatedWindows,
      focusedWindowId: targetId,
      fullscreenWindowId: null,
      focusedWindowActions: state.windowActions[targetId] ?? [],
    });

    syncToBackend();
  },

  setDesktopBounds(bounds: { x: number; y: number; width: number; height: number }) {
    const state = get();
    const { rects, bars } = recomputeLayout(state.tree, bounds);
    const updatedWindows = updateWindowRectsFromTree(
      state.windows,
      rects,
      state.focusedWindowId,
      state.fullscreenWindowId,
    );

    set({
      windows: updatedWindows,
      desktopBounds: bounds,
      tileRects: rects,
      splitBars: bars,
    });
  },

  setNodeRatio(path: TreePath, ratio: number) {
    const state = get();
    if (!state.tree) return;

    const newTree = setRatioAtPath(state.tree, path, ratio);
    const { rects, bars } = recomputeLayout(newTree, state.desktopBounds);
    const updatedWindows = updateWindowRectsFromTree(
      state.windows,
      rects,
      state.focusedWindowId,
      state.fullscreenWindowId,
    );

    set({
      windows: updatedWindows,
      tree: newTree,
      tileRects: rects,
      splitBars: bars,
    });

    syncToBackend();
  },

  relocateWindow(sourceWindowId: string, targetWindowId: string, edge: DropEdge) {
    const state = get();
    if (!state.tree) return;

    const newTree = relocateWindowInTree(state.tree, sourceWindowId, targetWindowId, edge);
    if (newTree === state.tree) return; // no-op (same ref means nothing changed)

    const { rects, bars } = recomputeLayout(newTree, state.desktopBounds);
    const updatedWindows = updateWindowRectsFromTree(
      state.windows,
      rects,
      sourceWindowId, // Focus the relocated window
      null, // Exit fullscreen
    );

    set({
      windows: updatedWindows,
      tree: newTree,
      focusedWindowId: sourceWindowId,
      fullscreenWindowId: null,
      tileRects: rects,
      splitBars: bars,
      focusedWindowActions: state.windowActions[sourceWindowId] ?? [],
    });

    syncToBackend();
  },

  // ─── Action management ────────────────────────────────────────────────────

  setFocusedWindowActions(actions: ActionDefinition[]) {
    set({ focusedWindowActions: actions });
  },

  setWindowActions(windowId: string, actions: ActionDefinition[]) {
    set((state) => {
      const nextWindowActions = {
        ...state.windowActions,
        [windowId]: actions,
      };
      return {
        windowActions: nextWindowActions,
        focusedWindowActions:
          state.focusedWindowId === windowId ? actions : state.focusedWindowActions,
      };
    });
  },

  // ─── Queries ──────────────────────────────────────────────────────────────

  getFocusedWindow(): WindowState | undefined {
    const state = get();
    return state.windows.find((w) => w.id === state.focusedWindowId);
  },

  getWindowsByMiniApp(miniAppId: string, args?: Record<string, unknown>): WindowState[] {
    return get().windows.filter(
      (w) => w.miniAppId === miniAppId && shallowEqualWindowArgs(w.args, args),
    );
  },

  // ─── Restore ──────────────────────────────────────────────────────────────

  restoreFromBackend(payload: WindowSyncPayload) {
    const bounds = get().desktopBounds;
    const { rects, bars } = recomputeLayout(payload.tree, bounds);
    const updatedWindows = updateWindowRectsFromTree(
      payload.windows.map(toWindowState),
      rects,
      payload.focusedWindowId,
      payload.fullscreenWindowId,
    );

    set({
      windows: updatedWindows,
      tree: payload.tree,
      focusedWindowId: payload.focusedWindowId,
      fullscreenWindowId: payload.fullscreenWindowId,
      windowIdCounter: payload.windowIdCounter,
      nextSplitDirection: payload.nextSplitDirection,
      tileRects: rects,
      splitBars: bars,
    });
  },
}));
