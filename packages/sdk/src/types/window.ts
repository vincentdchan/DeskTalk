/**
 * Represents the state of a window in the DeskTalk window manager.
 */
export interface WindowState {
  id: string;
  miniAppId: string;
  title: string;
  position: WindowPosition;
  size: WindowSize;
  minimized: boolean;
  maximized: boolean;
  focused: boolean;
  zIndex: number;
  /** Optional launch arguments passed when the window was opened (e.g. by the AI). */
  args?: Record<string, unknown>;
}

/**
 * Persisted window identity for the tiling window manager.
 * Layout and derived fields are reconstructed from the tiling tree at runtime.
 */
export interface PersistedWindow {
  id: string;
  miniAppId: string;
  title: string;
  args?: Record<string, unknown>;
}

export interface PersistedWindowState {
  version: 2;
  windows: PersistedWindow[];
  focusedWindowId: string | null;
  fullscreenWindowId: string | null;
  windowIdCounter: number;
  nextSplitDirection: 'horizontal' | 'vertical' | 'auto';
}

export interface WindowPosition {
  x: number;
  y: number;
}

export interface WindowSize {
  width: number;
  height: number;
}
