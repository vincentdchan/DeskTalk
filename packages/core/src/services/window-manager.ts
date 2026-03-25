import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

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
  tree: TilingNode | null;
}

interface LegacyWindowState extends PersistedWindow {
  position?: { x: number; y: number };
  size?: { width: number; height: number };
  minimized?: boolean;
  maximized?: boolean;
  focused?: boolean;
  zIndex?: number;
}

interface LegacyPersistedWindowState {
  windows?: LegacyWindowState[];
  tree?: TilingNode | null;
  focusedWindowId?: string | null;
  fullscreenWindowId?: string | null;
  windowIdCounter?: number;
  nextSplitDirection?: 'horizontal' | 'vertical' | 'auto';
}

function emptyPersistedState(): PersistedWindowState {
  return {
    version: 2,
    windows: [],
    tree: null,
    focusedWindowId: null,
    fullscreenWindowId: null,
    windowIdCounter: 0,
    nextSplitDirection: 'auto',
  };
}

function toPersistedWindow(window: LegacyWindowState): PersistedWindow {
  return {
    id: window.id,
    miniAppId: window.miniAppId,
    title: window.title,
    args: window.args,
  };
}

function isPersistedWindow(value: unknown): value is PersistedWindow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.miniAppId === 'string' &&
    typeof candidate.title === 'string'
  );
}

function migratePersistedState(parsed: unknown): PersistedWindowState | null {
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const candidate = parsed as Record<string, unknown>;
  const windows = Array.isArray(candidate.windows) ? candidate.windows : [];
  const focusedWindowId =
    typeof candidate.focusedWindowId === 'string' ? candidate.focusedWindowId : null;
  const fullscreenWindowId =
    typeof candidate.fullscreenWindowId === 'string' ? candidate.fullscreenWindowId : null;
  const windowIdCounter =
    typeof candidate.windowIdCounter === 'number' ? candidate.windowIdCounter : windows.length;
  const nextSplitDirection =
    candidate.nextSplitDirection === 'horizontal' ||
    candidate.nextSplitDirection === 'vertical' ||
    candidate.nextSplitDirection === 'auto'
      ? candidate.nextSplitDirection
      : 'auto';

  if (candidate.version === 2) {
    return {
      version: 2,
      windows: windows.filter(isPersistedWindow),
      tree: (candidate.tree as TilingNode | null | undefined) ?? null,
      focusedWindowId,
      fullscreenWindowId,
      windowIdCounter,
      nextSplitDirection,
    };
  }

  const legacy = candidate as LegacyPersistedWindowState;
  return {
    version: 2,
    windows: windows
      .filter(isPersistedWindow)
      .map((window) => toPersistedWindow(window as LegacyWindowState)),
    tree: legacy.tree ?? null,
    focusedWindowId,
    fullscreenWindowId,
    windowIdCounter,
    nextSplitDirection,
  };
}

function readPersistedState(filePath: string): PersistedWindowState | null {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    return migratePersistedState(JSON.parse(readFileSync(filePath, 'utf-8')));
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
  private state: PersistedWindowState = emptyPersistedState();
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
    this.state = emptyPersistedState();
    this.load();
  }

  private load(): void {
    const persisted = readPersistedState(this.filePath);
    if (!persisted) {
      return;
    }

    this.state = {
      version: 2,
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
      nextSplitDirection:
        persisted.nextSplitDirection === 'horizontal' ||
        persisted.nextSplitDirection === 'vertical' ||
        persisted.nextSplitDirection === 'auto'
          ? persisted.nextSplitDirection
          : 'auto',
    };

    writePersistedState(this.filePath, this.state);

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
      version: 2,
      windows: Array.isArray(payload.windows) ? payload.windows : [],
      tree: payload.tree ?? null,
      focusedWindowId: typeof payload.focusedWindowId === 'string' ? payload.focusedWindowId : null,
      fullscreenWindowId:
        typeof payload.fullscreenWindowId === 'string' ? payload.fullscreenWindowId : null,
      windowIdCounter: typeof payload.windowIdCounter === 'number' ? payload.windowIdCounter : 0,
      nextSplitDirection:
        payload.nextSplitDirection === 'horizontal' ||
        payload.nextSplitDirection === 'vertical' ||
        payload.nextSplitDirection === 'auto'
          ? payload.nextSplitDirection
          : 'auto',
    };
    writePersistedState(this.filePath, this.state);
  }

  /**
   * Get the current windows (from last synced state).
   */
  getWindows(): PersistedWindow[] {
    return this.state.windows;
  }

  getFocusedWindow(): PersistedWindow | undefined {
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
  async activatePersistedMiniApps(
    activate: (miniAppId: string, launchArgs: Array<Record<string, unknown>>) => Promise<void>,
  ): Promise<void> {
    const windowsByMiniApp = new Map<string, Array<Record<string, unknown>>>();

    for (const window of this.state.windows) {
      const launchArgs = windowsByMiniApp.get(window.miniAppId) ?? [];
      launchArgs.push(window.args ?? {});
      windowsByMiniApp.set(window.miniAppId, launchArgs);
    }

    for (const [miniAppId, launchArgs] of windowsByMiniApp) {
      await activate(miniAppId, launchArgs);
    }
  }

  /**
   * Build a dynamic desktop context block to prepend to user messages.
   *
   * This is injected per-prompt so the AI always sees the latest state
   * without polluting the cacheable system prompt.
   */
  getDesktopContext(
    availableMiniApps: Array<{ id: string; name: string }>,
    availableLiveApps: Array<{ id: string; name: string }>,
    userHomeDir: string,
  ): string {
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
    const liveAppLines = availableLiveApps.length
      ? availableLiveApps.map((app) => `  ${app.id}: ${app.name}`)
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
      `Home: ${userHomeDir}`,
      `Focused: ${focusedWindow ? `"${focusedWindow.title}" (${focusedWindow.id}, miniapp: ${focusedWindow.miniAppId})` : 'none'}`,
      ...layoutLines,
      'MiniApps:',
      ...miniAppLines,
      'LiveApps:',
      ...liveAppLines,
      ...(actionLines.length > 0
        ? [`Actions (${focusedWindow!.id}):`, ...actionLines]
        : ['Actions: (none — no focused window or no actions registered)']),
      '[/Desktop Context]',
    ].join('\n');
  }
}
