import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { WindowState } from '@desktalk/sdk';

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

export interface PersistedWindowState {
  windows: WindowState[];
  nextZIndex: number;
  windowIdCounter: number;
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

/**
 * Backend window manager service — persistence-only.
 *
 * The frontend Zustand store is the live source of truth.
 * This service:
 *  - Loads persisted state on startup for the initial `window:state` message
 *  - Receives synced state from the frontend and persists it
 *  - Keeps window actions metadata for the AI system prompt
 *  - Provides `getSystemPromptContext()` for dynamic AI prompt injection
 */
export class WindowManagerService {
  private state: PersistedWindowState = {
    windows: [],
    nextZIndex: 1,
    windowIdCounter: 0,
  };
  private readonly windowActions: Record<string, SerializableActionDefinition[]> = {};

  constructor(private readonly filePath: string) {
    this.load();
  }

  private load(): void {
    const persisted = readPersistedState(this.filePath);
    if (!persisted) {
      return;
    }

    this.state = {
      windows: Array.isArray(persisted.windows) ? persisted.windows : [],
      nextZIndex: typeof persisted.nextZIndex === 'number' ? persisted.nextZIndex : 1,
      windowIdCounter:
        typeof persisted.windowIdCounter === 'number'
          ? persisted.windowIdCounter
          : (persisted.windows?.length ?? 0),
    };

    // Ensure at least one window is focused on load
    if (this.state.windows.length > 0 && !this.state.windows.some((w) => w.focused)) {
      const topWindow = this.state.windows.reduce((top, w) => (w.zIndex > top.zIndex ? w : top));
      this.state.windows = this.state.windows.map((w) => ({
        ...w,
        focused: w.id === topWindow.id && !w.minimized,
      }));
    }
  }

  /**
   * Get the persisted state to send to the frontend on initial connect.
   */
  getPersistedState(): PersistedWindowState {
    return this.state;
  }

  /**
   * Receive the full state from the frontend and persist it.
   * Called when the frontend sends `window:sync`.
   */
  syncState(payload: PersistedWindowState): void {
    this.state = {
      windows: Array.isArray(payload.windows) ? payload.windows : [],
      nextZIndex: typeof payload.nextZIndex === 'number' ? payload.nextZIndex : 1,
      windowIdCounter: typeof payload.windowIdCounter === 'number' ? payload.windowIdCounter : 0,
    };
    writePersistedState(this.filePath, this.state);
  }

  /**
   * Get the current windows (from last synced state).
   */
  getWindows(): WindowState[] {
    return this.state.windows;
  }

  getFocusedWindow(): WindowState | undefined {
    return this.state.windows.find((w) => w.focused);
  }

  getWindowActions(windowId: string): SerializableActionDefinition[] {
    return this.windowActions[windowId] ?? [];
  }

  setWindowActions(windowId: string, actions: SerializableActionDefinition[]): void {
    this.windowActions[windowId] = actions;
  }

  /**
   * Activate persisted MiniApps on startup.
   */
  activatePersistedMiniApps(activate: (miniAppId: string) => void): void {
    const activeMiniAppIds = new Set(this.state.windows.map((w) => w.miniAppId));
    for (const miniAppId of activeMiniAppIds) {
      activate(miniAppId);
    }
  }

  /**
   * Build context for the AI system prompt describing the current desktop state.
   */
  getSystemPromptContext(availableMiniApps: Array<{ id: string; name: string }>): string {
    const focusedWindow = this.getFocusedWindow();
    const windowLines = this.state.windows.length
      ? [...this.state.windows]
          .sort((a, b) => a.zIndex - b.zIndex)
          .map((w) => {
            const states = [w.focused ? 'focused' : null, w.minimized ? 'minimized' : null]
              .filter(Boolean)
              .join(', ');
            return `- ${w.id}: "${w.title}" (miniapp: ${w.miniAppId}${states ? `, ${states}` : ''}, position: ${w.position.x},${w.position.y}, size: ${w.size.width}x${w.size.height})`;
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
      'You are running inside DeskTalk and can control the desktop with two tools:',
      '- window_control: manage windows (focus, minimize, maximize, close, open, invoke actions)',
      '- app_control: manage MiniApp lifecycle (list apps with status, launch, quit)',
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
      'Use app_control action="list" to see which apps are running and their activation status.',
    ].join('\n');
  }
}
