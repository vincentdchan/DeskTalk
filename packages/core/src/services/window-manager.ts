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

/**
 * Tiling tree node types (mirrored from frontend tiling-tree.ts for persistence).
 */
export interface LeafNode {
  type: 'leaf';
  windowId: string;
}

export interface ContainerNode {
  type: 'container';
  split: 'horizontal' | 'vertical';
  ratio: number;
  children: [TilingNode, TilingNode];
}

export type TilingNode = LeafNode | ContainerNode;

export interface PersistedWindowState {
  windows: WindowState[];
  tree: TilingNode | null;
  focusedWindowId: string | null;
  fullscreenWindowId: string | null;
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

/** Collect all window IDs from a tiling tree in traversal order. */
function getLeafIds(node: TilingNode): string[] {
  if (node.type === 'leaf') return [node.windowId];
  return [...getLeafIds(node.children[0]), ...getLeafIds(node.children[1])];
}

/** Build a human-readable description of the tiling layout for AI context. */
function describeLayout(
  node: TilingNode,
  titles: Record<string, string>,
  focusedId: string | null,
  indent = 0,
): string {
  const pad = '  '.repeat(indent);

  if (node.type === 'leaf') {
    const title = titles[node.windowId] ?? node.windowId;
    const focus = node.windowId === focusedId ? ' (focused)' : '';
    return `${pad}${title}${focus}`;
  }

  const pctFirst = Math.round(node.ratio * 100);
  const pctSecond = 100 - pctFirst;
  const header = `${pad}${node.split} split (${pctFirst}/${pctSecond})`;
  const first = describeLayout(node.children[0], titles, focusedId, indent + 1);
  const second = describeLayout(node.children[1], titles, focusedId, indent + 1);
  return `${header}\n${first}\n${second}`;
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
    tree: null,
    focusedWindowId: null,
    fullscreenWindowId: null,
    windowIdCounter: 0,
  };
  private readonly windowActions: Record<string, SerializableActionDefinition[]> = {};
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.load();
  }

  /**
   * Switch the backing file path (e.g. when a different user connects)
   * and reload persisted state from the new location.
   */
  switchUser(newFilePath: string): void {
    this.filePath = newFilePath;
    this.state = {
      windows: [],
      tree: null,
      focusedWindowId: null,
      fullscreenWindowId: null,
      windowIdCounter: 0,
    };
    this.load();
  }

  private load(): void {
    const persisted = readPersistedState(this.filePath);
    if (!persisted) {
      return;
    }

    this.state = {
      windows: Array.isArray(persisted.windows) ? persisted.windows : [],
      tree: persisted.tree ?? null,
      focusedWindowId:
        typeof persisted.focusedWindowId === 'string' ? persisted.focusedWindowId : null,
      fullscreenWindowId:
        typeof persisted.fullscreenWindowId === 'string' ? persisted.fullscreenWindowId : null,
      windowIdCounter:
        typeof persisted.windowIdCounter === 'number'
          ? persisted.windowIdCounter
          : (persisted.windows?.length ?? 0),
    };

    // Ensure at least one window is focused on load
    if (this.state.windows.length > 0 && !this.state.focusedWindowId) {
      if (this.state.tree) {
        const leafIds = getLeafIds(this.state.tree);
        if (leafIds.length > 0) {
          this.state.focusedWindowId = leafIds[0];
        }
      }
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
      tree: payload.tree ?? null,
      focusedWindowId: typeof payload.focusedWindowId === 'string' ? payload.focusedWindowId : null,
      fullscreenWindowId:
        typeof payload.fullscreenWindowId === 'string' ? payload.fullscreenWindowId : null,
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
    return this.state.windows.find((w) => w.id === this.state.focusedWindowId);
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
  async activatePersistedMiniApps(activate: (miniAppId: string) => Promise<void>): Promise<void> {
    const activeMiniAppIds = new Set(this.state.windows.map((w) => w.miniAppId));
    for (const miniAppId of activeMiniAppIds) {
      await activate(miniAppId);
    }
  }

  /**
   * Build a dynamic desktop context block to prepend to user messages.
   *
   * This is injected per-prompt so the AI always sees the latest state
   * without polluting the cacheable system prompt.
   */
  getDesktopContext(availableMiniApps: Array<{ id: string; name: string }>): string {
    const focusedWindow = this.getFocusedWindow();

    // ─── Layout ───────────────────────────────────────────────────────────
    const layoutLines: string[] = [];
    if (this.state.tree) {
      const titles: Record<string, string> = {};
      for (const w of this.state.windows) {
        titles[w.id] = `${w.title} (${w.id}, miniapp: ${w.miniAppId})`;
      }
      layoutLines.push(
        'Layout:',
        describeLayout(this.state.tree, titles, this.state.focusedWindowId, 1),
      );
    } else {
      layoutLines.push('Layout: (empty)');
    }

    // ─── MiniApps ─────────────────────────────────────────────────────────
    const miniAppLines = availableMiniApps.length
      ? availableMiniApps.map((m) => `  ${m.id}: ${m.name}`)
      : ['  (none)'];

    // ─── Actions on focused window ────────────────────────────────────────
    const actionLines: string[] = [];
    if (focusedWindow) {
      const actions = this.windowActions[focusedWindow.id] ?? [];
      for (const action of actions) {
        const paramEntries = action.params ? Object.entries(action.params) : [];
        if (paramEntries.length === 0) {
          actionLines.push(`  ${action.name}: ${action.description} (no params)`);
        } else {
          const paramDescs = paramEntries
            .map(([key, p]) => {
              const req = p.required ? 'required' : 'optional';
              const desc = p.description ? ` — ${p.description}` : '';
              return `${key}: ${p.type} (${req}${desc})`;
            })
            .join(', ');
          actionLines.push(`  ${action.name}: ${action.description} | params: {${paramDescs}}`);
        }
      }
    }

    return [
      '[Desktop Context]',
      `Focused: ${focusedWindow ? `"${focusedWindow.title}" (${focusedWindow.id}, miniapp: ${focusedWindow.miniAppId})` : 'none'}`,
      ...layoutLines,
      'MiniApps:',
      ...miniAppLines,
      ...(actionLines.length > 0
        ? [`Actions (${focusedWindow!.id}):`, ...actionLines]
        : ['Actions: (none — no focused window or no actions registered)']),
      '[/Desktop Context]',
    ].join('\n');
  }
}
