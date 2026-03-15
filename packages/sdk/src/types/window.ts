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

export interface WindowPosition {
  x: number;
  y: number;
}

export interface WindowSize {
  width: number;
  height: number;
}
