import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { WindowPosition, WindowSize, WindowState } from '@desktalk/sdk';

const MIN_WINDOW_WIDTH = 300;
const MIN_WINDOW_HEIGHT = 200;

export interface SerializableActionDefinition {
  name: string;
  description: string;
  params?: Record<
    string,
    {
      type: 'string' | 'number' | 'boolean';
      description?: string;
      required?: boolean;
    }
  >;
}

export interface WindowManagerSnapshot {
  windows: WindowState[];
  focusedWindowActions: SerializableActionDefinition[];
}

interface PersistedWindowState {
  windows: WindowState[];
  nextZIndex: number;
  windowIdCounter: number;
}

function normalizeSize(size: WindowSize): WindowSize {
  return {
    width: Math.max(size.width, MIN_WINDOW_WIDTH),
    height: Math.max(size.height, MIN_WINDOW_HEIGHT),
  };
}

function readPersistedState(filePath: string): PersistedWindowState | null {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as PersistedWindowState;
  } catch {
    return null;
  }
}

function writePersistedState(filePath: string, state: PersistedWindowState): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8');
}

export class WindowManagerService {
  private windows: WindowState[] = [];
  private nextZIndex = 1;
  private windowIdCounter = 0;
  private readonly windowActions: Record<string, SerializableActionDefinition[]> = {};

  constructor(
    private readonly filePath: string,
    private readonly onChange?: (snapshot: WindowManagerSnapshot) => void,
  ) {
    this.load();
  }

  private emitChange(): void {
    this.persist();
    this.onChange?.(this.getSnapshot());
  }

  private persist(): void {
    writePersistedState(this.filePath, {
      windows: this.windows,
      nextZIndex: this.nextZIndex,
      windowIdCounter: this.windowIdCounter,
    });
  }

  private load(): void {
    const persisted = readPersistedState(this.filePath);
    if (!persisted) {
      return;
    }

    this.windows = Array.isArray(persisted.windows)
      ? persisted.windows.map((window) => ({
          ...window,
          size: normalizeSize(window.size),
        }))
      : [];
    this.nextZIndex = typeof persisted.nextZIndex === 'number' ? persisted.nextZIndex : 1;
    this.windowIdCounter =
      typeof persisted.windowIdCounter === 'number'
        ? persisted.windowIdCounter
        : this.windows.length;

    if (this.windows.length > 0 && !this.windows.some((window) => window.focused)) {
      const topWindow = this.windows.reduce((top, window) =>
        window.zIndex > top.zIndex ? window : top,
      );
      this.windows = this.windows.map((window) => ({
        ...window,
        focused: window.id === topWindow.id && !window.minimized,
      }));
    }
  }

  private getTopVisibleWindow(): WindowState | undefined {
    const visibleWindows = this.windows.filter((window) => !window.minimized);
    if (visibleWindows.length === 0) {
      return undefined;
    }
    return visibleWindows.reduce((top, window) => (window.zIndex > top.zIndex ? window : top));
  }

  private getFocusedWindowActions(): SerializableActionDefinition[] {
    const focusedWindow = this.windows.find((window) => window.focused);
    return focusedWindow ? (this.windowActions[focusedWindow.id] ?? []) : [];
  }

  getSnapshot(): WindowManagerSnapshot {
    return {
      windows: this.windows,
      focusedWindowActions: this.getFocusedWindowActions(),
    };
  }

  getFocusedWindow(): WindowState | undefined {
    return this.windows.find((window) => window.focused);
  }

  getWindowActions(windowId: string): SerializableActionDefinition[] {
    return this.windowActions[windowId] ?? [];
  }

  openWindow(miniAppId: string, title: string): string {
    const offset = (this.windows.length % 10) * 30;
    const windowId = `win-${++this.windowIdCounter}`;

    const newWindow: WindowState = {
      id: windowId,
      miniAppId,
      title,
      position: { x: 100 + offset, y: 80 + offset },
      size: { width: 800, height: 600 },
      minimized: false,
      maximized: false,
      focused: true,
      zIndex: this.nextZIndex,
    };

    this.windows = [...this.windows.map((window) => ({ ...window, focused: false })), newWindow];
    this.nextZIndex += 1;
    this.emitChange();
    return windowId;
  }

  closeWindow(windowId: string): void {
    const targetWindow = this.windows.find((window) => window.id === windowId);
    if (!targetWindow) {
      return;
    }

    this.windows = this.windows.filter((window) => window.id !== windowId);
    delete this.windowActions[windowId];

    const topWindow = this.getTopVisibleWindow();
    if (topWindow) {
      this.windows = this.windows.map((window) => ({
        ...window,
        focused: window.id === topWindow.id,
      }));
    }

    this.emitChange();
  }

  focusWindow(windowId: string): void {
    const targetWindow = this.windows.find((window) => window.id === windowId);
    if (!targetWindow) {
      return;
    }

    this.windows = this.windows.map((window) => ({
      ...window,
      focused: window.id === windowId,
      minimized: window.id === windowId ? false : window.minimized,
      zIndex: window.id === windowId ? this.nextZIndex : window.zIndex,
    }));
    this.nextZIndex += 1;
    this.emitChange();
  }

  minimizeWindow(windowId: string): void {
    let changed = false;
    this.windows = this.windows.map((window) => {
      if (window.id !== windowId) {
        return window;
      }
      changed = true;
      return { ...window, minimized: true, focused: false };
    });

    if (!changed) {
      return;
    }

    const topWindow = this.getTopVisibleWindow();
    if (topWindow) {
      this.windows = this.windows.map((window) => ({
        ...window,
        focused: window.id === topWindow.id,
      }));
    }

    this.emitChange();
  }

  maximizeWindow(windowId: string): void {
    let changed = false;
    this.windows = this.windows.map((window) => {
      if (window.id !== windowId) {
        return window;
      }
      changed = true;
      return { ...window, maximized: !window.maximized };
    });

    if (!changed) {
      return;
    }

    this.emitChange();
  }

  moveWindow(windowId: string, position: WindowPosition): void {
    let changed = false;
    this.windows = this.windows.map((window) => {
      if (window.id !== windowId) {
        return window;
      }
      changed = true;
      return { ...window, position };
    });

    if (!changed) {
      return;
    }

    this.emitChange();
  }

  resizeWindow(windowId: string, size: WindowSize): void {
    let changed = false;
    const normalized = normalizeSize(size);
    this.windows = this.windows.map((window) => {
      if (window.id !== windowId) {
        return window;
      }
      changed = true;
      return { ...window, size: normalized };
    });

    if (!changed) {
      return;
    }

    this.emitChange();
  }

  setWindowActions(windowId: string, actions: SerializableActionDefinition[]): void {
    this.windowActions[windowId] = actions;
    this.onChange?.(this.getSnapshot());
  }

  activatePersistedMiniApps(activate: (miniAppId: string) => void): void {
    const activeMiniAppIds = new Set(this.windows.map((window) => window.miniAppId));
    for (const miniAppId of activeMiniAppIds) {
      activate(miniAppId);
    }
  }

  getSystemPromptContext(availableMiniApps: Array<{ id: string; name: string }>): string {
    const focusedWindow = this.getFocusedWindow();
    const windowLines = this.windows.length
      ? [...this.windows]
          .sort((a, b) => a.zIndex - b.zIndex)
          .map((window) => {
            const states = [
              window.focused ? 'focused' : null,
              window.minimized ? 'minimized' : null,
            ]
              .filter(Boolean)
              .join(', ');
            return `- ${window.id}: "${window.title}" (miniapp: ${window.miniAppId}${states ? `, ${states}` : ''}, position: ${window.position.x},${window.position.y}, size: ${window.size.width}x${window.size.height})`;
          })
      : ['- No open windows'];

    const focusedActionLines = focusedWindow
      ? (this.windowActions[focusedWindow.id] ?? []).map(
          (action) => `- ${action.name}: ${action.description}`,
        )
      : [];

    const miniAppLines = availableMiniApps.length
      ? availableMiniApps.map((miniApp) => `- ${miniApp.id}: ${miniApp.name}`)
      : ['- No MiniApps registered'];

    return [
      'You are running inside DeskTalk and can control desktop windows with the window_control tool.',
      '',
      'Current desktop state:',
      focusedWindow
        ? `- Focused window: "${focusedWindow.title}" (${focusedWindow.id}, miniapp: ${focusedWindow.miniAppId})`
        : '- Focused window: none',
      ...windowLines,
      '',
      'Available MiniApps:',
      ...miniAppLines,
      '',
      'Available actions on the focused window:',
      ...(focusedActionLines.length > 0 ? focusedActionLines : ['- No actions registered']),
      '',
      'Use window_control action="list" when you need the latest windows or actions before operating on them.',
    ].join('\n');
  }
}
