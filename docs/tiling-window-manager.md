# Tiling Window Manager

## Motivation

The current window manager uses a traditional **floating** model: windows have absolute positions, arbitrary sizes, z-index stacking, and free-form dragging/resizing. This works but has well-known drawbacks in a productivity-oriented environment:

- Windows overlap and require manual arrangement.
- Screen real estate is wasted or unevenly distributed.
- There is no keyboard-driven workflow for power users.

This proposal replaces the floating model with a **tiling window manager** inspired by [i3](https://i3wm.org/). All windows tile automatically to fill the available workspace without overlap, and the user navigates and reorganizes windows entirely via keyboard shortcuts.

## Goals

1. **Automatic tiling** -- windows fill the workspace with no gaps or overlaps.
2. **Keyboard-first navigation** -- all operations are available via shortcuts.
3. **Fullscreen toggle** -- any window can go fullscreen and return to its tile.
4. **Single-window simplicity** -- when only one window is open it fills the entire workspace.
5. **Backward compatibility** -- the MiniApp API (`WindowState`, `openWindow`, `closeWindow`, `focusWindow`) stays the same from a MiniApp's perspective; tiling is purely a core concern.
6. **AI compatibility** -- the AI's `list_actions` / `invoke_action` pipeline is unaffected; desktop context just reports the tiling layout instead of pixel positions.

## Non-Goals

- Multi-monitor / multi-output support.
- Multiple workspaces / virtual desktops (may be added later).
- Tabbed containers (may be added later).
- Floating window escape hatch (all windows tile; the maximize/fullscreen toggle covers the primary use case for a single expanded window).

---

## Layout Model

### Tree Structure

Like i3, the layout is represented as a **binary split tree**:

```
Container (root)
 ├── Container (split=horizontal)
 │    ├── Leaf (Note)
 │    └── Leaf (Todo)
 └── Leaf (File Explorer)
```

Each node is either:

| Node type     | Description                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Leaf**      | Holds exactly one window.                                                                                         |
| **Container** | Holds two children with a split direction (`horizontal` or `vertical`) and a split ratio (0.0--1.0, default 0.5). |

The **root** node always exists and fills the tiled Window Area inside the shell layout. The permanent AI Assistant pane on the right sits outside this tree. If the desktop WebSocket bridge is connecting or reconnecting, the shell temporarily masks both regions so the user cannot interact with stale window state.

### Node Types

```ts
interface LeafNode {
  type: 'leaf';
  windowId: string;
}

interface ContainerNode {
  type: 'container';
  split: 'horizontal' | 'vertical'; // horizontal = side-by-side, vertical = top-and-bottom
  ratio: number; // 0.0 to 1.0, proportion allocated to first child
  children: [TilingNode, TilingNode];
}

type TilingNode = LeafNode | ContainerNode;
```

### Split Direction

| Direction    | Visual     | Description                                |
| ------------ | ---------- | ------------------------------------------ |
| `horizontal` | `[A \| B]` | Children placed side by side (left/right). |
| `vertical`   | `[A / B]`  | Children placed top and bottom.            |

Default split alternation: the first split is `horizontal`, and each nested level alternates (i3's "default" layout behavior). The user can override this per-split.

---

## Window Lifecycle Changes

### Opening a Window

1. If a window with the same `miniAppId` and shallow-equal launch `args` already exists, focus that window instead of opening a duplicate.
2. If no matching window exists and no windows are open, the new window becomes the root leaf -- filling the entire workspace.
3. If no matching window exists and windows exist, the new window splits the **currently focused** leaf:
   - A new container replaces the focused leaf.
   - The container's children are the previously focused window (first child) and the new window (second child).
   - The split direction alternates based on the depth of the node, or follows the user's last explicit split preference.
   - The new window receives focus.

### Closing a Window

1. Remove the leaf from the tree.
2. Its sibling (the other child of the parent container) is "promoted" to replace the parent container, inheriting the parent's position in the tree.
3. If the closed window was focused, the promoted sibling (or its deepest focused descendant) receives focus.
4. If no windows remain, the workspace is empty.

### Focusing a Window

Focus moves to the target leaf. The tree structure does not change. The focused window's border gets the accent highlight (same as today).

### Fullscreen Toggle

`Option + F` toggles the focused window between **fullscreen** and **tiled** mode:

- **Fullscreen**: the window renders on top of the entire Window Area, covering all other tiles. The tree structure is preserved -- the window just renders at full size temporarily.
- **Tiled**: the window returns to its tile position in the tree.

Only one window can be fullscreen at a time. Opening or focusing another window exits fullscreen.

### Minimize

Minimizing removes the window from the tiling tree (same as closing, structurally) but keeps it alive in the Dock. Un-minimizing re-inserts it by splitting the currently focused leaf.

### Maximize (Removed)

The old "maximize" toggle is replaced by the fullscreen toggle. The `maximized` field on `WindowState` is repurposed to mean fullscreen.

---

## Keyboard Shortcuts

All shortcuts use the **Option** (Alt) modifier to avoid conflicts with MiniApp-internal shortcuts and browser defaults.

### Navigation

| Shortcut     | Action            | Description                                                                                                                          |
| ------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `Option + 1` | Focus workspace 1 | Navigate to (or assign) workspace slot 1. In the initial single-workspace implementation, this focuses the 1st window in tree order. |
| `Option + 2` | Focus workspace 2 | Navigate to the 2nd window in tree order.                                                                                            |
| `Option + 3` | Focus workspace 3 | Navigate to the 3rd window in tree order.                                                                                            |
| `Option + H` | Focus left        | Move focus to the nearest tile to the left.                                                                                          |
| `Option + L` | Focus right       | Move focus to the nearest tile to the right.                                                                                         |
| `Option + K` | Focus up          | Move focus to the nearest tile above.                                                                                                |
| `Option + J` | Focus down        | Move focus to the nearest tile below.                                                                                                |

> **Note on `Option + 1/2/3`**: In i3 these switch workspaces. Since DeskTalk launches with a single workspace, these are mapped to quick-focus the Nth window in left-to-right, top-to-bottom tree traversal order. If virtual desktops are added later, these can be remapped to workspace switching.

### Window Management

| Shortcut             | Action            | Description                                             |
| -------------------- | ----------------- | ------------------------------------------------------- |
| `Option + F`         | Toggle fullscreen | Toggle the focused window between fullscreen and tiled. |
| `Option + W`         | Close window      | Close the focused window.                               |
| `Option + Shift + H` | Move left         | Swap the focused window with its left neighbor.         |
| `Option + Shift + L` | Move right        | Swap the focused window with its right neighbor.        |
| `Option + Shift + K` | Move up           | Swap the focused window with its upper neighbor.        |
| `Option + Shift + J` | Move down         | Swap the focused window with its lower neighbor.        |

### Split Control

| Shortcut     | Action           | Description                                                              |
| ------------ | ---------------- | ------------------------------------------------------------------------ |
| `Option + V` | Split vertical   | Next window opened in the focused container uses a vertical split.       |
| `Option + B` | Split horizontal | Next window opened in the focused container uses a horizontal split.     |
| `Option + R` | Rotate split     | Toggle the parent container's split direction (horizontal <-> vertical). |

### Resize

| Shortcut     | Action   | Description                                                        |
| ------------ | -------- | ------------------------------------------------------------------ |
| `Option + [` | Shrink   | Decrease the focused window's share in its parent container by 5%. |
| `Option + ]` | Grow     | Increase the focused window's share in its parent container by 5%. |
| `Option + =` | Equalize | Reset the parent container's ratio to 50/50.                       |

---

## State Changes

### New Tiling State

The `useWindowManager` Zustand store gains a tiling tree alongside the existing `windows` array:

```ts
interface WindowManagerState {
  // Existing -- windows remain the source of truth for per-window metadata
  windows: WindowState[];
  windowIdCounter: number;
  focusedWindowActions: ActionDefinition[];
  windowActions: Record<string, ActionDefinition[]>;

  // New -- tiling layout
  tree: TilingNode | null; // null when no windows are open
  focusedWindowId: string | null; // explicit focus tracking (replaces window.focused)
  fullscreenWindowId: string | null; // which window (if any) is in fullscreen mode
  nextSplitDirection: 'horizontal' | 'vertical' | 'auto'; // user override for next split
}
```

### Removed / Changed Fields

| Field                   | Change                                                                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `WindowState.position`  | No longer used for rendering (computed from tree). Kept in the type for SDK compat but always set to `{ x: 0, y: 0 }`.            |
| `WindowState.size`      | No longer used for rendering (computed from tree). Kept in the type for SDK compat but set to computed pixel values after layout. |
| `WindowState.zIndex`    | Removed from rendering logic. All tiles are at the same z-level. Fullscreen window gets a single elevated z-index.                |
| `WindowState.focused`   | Derived from `focusedWindowId` instead of stored per-window.                                                                      |
| `WindowState.maximized` | Repurposed to mean "fullscreen" in tiling context.                                                                                |
| `nextZIndex`            | Removed. No z-index stacking in tiling mode.                                                                                      |

### Sync Payload Changes

```ts
interface WindowSyncPayload {
  version: 2;
  windows: Array<{
    id: string;
    miniAppId: string;
    title: string;
    args?: Record<string, unknown>;
  }>;
  tree: TilingNode | null;
  focusedWindowId: string | null;
  fullscreenWindowId: string | null;
  windowIdCounter: number;
  nextSplitDirection: 'horizontal' | 'vertical' | 'auto';
}
```

Persisted window sessions should store only window identity plus the tiling tree. Pixel `position`, `size`, `zIndex`, and other derived fields are recomputed from the tree and current desktop bounds during restore, so they should not be written to disk.

---

## Rendering

### Layout Computation

A pure function computes pixel rectangles from the tree:

```ts
interface TileRect {
  windowId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

function computeLayout(
  node: TilingNode,
  bounds: { x: number; y: number; width: number; height: number },
  gap: number,
): TileRect[];
```

This recursively walks the tree:

- **Leaf**: returns a single `TileRect` matching `bounds` (minus gap padding).
- **Container (horizontal)**: splits `bounds.width` by `ratio`, recurses into each child.
- **Container (vertical)**: splits `bounds.height` by `ratio`, recurses into each child.

The `gap` parameter (default ~4px) adds spacing between tiles for visual separation.

### WindowChrome Changes

- **Remove** drag-to-move and resize-handle interactions. Tiles are positioned by the tree, not by user dragging.
- **Keep** the title bar with traffic-light buttons (close, minimize, fullscreen-toggle replacing maximize).
- **Position** each window with `position: absolute` using the computed `TileRect` values, with CSS transitions for smooth rearrangement.
- **Fullscreen** window gets `inset: 0` on the Window Area (same as old maximize, but explicitly toggled).

### Shell Changes

The `Shell` component's desktop area changes from rendering free-positioned `WindowChrome` elements to:

1. Call `computeLayout(tree, desktopBounds, gap)` to get tile rects.
2. Render each `WindowChrome` at its computed rect.
3. If `fullscreenWindowId` is set, render that window at full desktop bounds on top.

### CSS Transitions

When windows are added, removed, or swapped, their rects change. Apply CSS `transition` on `left`, `top`, `width`, `height` (~200ms ease) for fluid animations.

---

## Keyboard Shortcut System

A new `useKeyboardShortcuts` hook registers global `keydown` listeners on the `window` object:

```ts
function useKeyboardShortcuts(): void {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (!e.altKey) return;
      // ... dispatch based on e.key
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
```

This hook is mounted once in `Shell`. It reads from and dispatches to the `useWindowManager` store.

### Conflict Avoidance

- `Option` (Alt) is chosen because macOS reserves `Cmd` for system shortcuts, and `Ctrl` is commonly used by terminal-based MiniApps.
- If a MiniApp's internal input field is focused, shortcuts should be suppressed when the event target is an `<input>`, `<textarea>`, or `[contenteditable]` element, unless the MiniApp explicitly opts in.

---

## Backend Changes

### WindowManagerService

The backend `WindowManagerService` persists the new `WindowSyncPayload` shape (with `tree`, `focusedWindowId`, `fullscreenWindowId`, and `nextSplitDirection`). The file format changes from a flat floating-window snapshot to a tiled-layout snapshot with schema versioning.

Example persisted file:

```json
{
  "version": 2,
  "windows": [
    { "id": "win-1", "miniAppId": "note", "title": "Note" },
    { "id": "win-2", "miniAppId": "todo", "title": "Todo" }
  ],
  "tree": {
    "type": "container",
    "split": "horizontal",
    "ratio": 0.5,
    "children": [
      { "type": "leaf", "windowId": "win-1" },
      { "type": "leaf", "windowId": "win-2" }
    ]
  },
  "focusedWindowId": "win-1",
  "fullscreenWindowId": null,
  "windowIdCounter": 2,
  "nextSplitDirection": "auto"
}
```

On restore, the backend or frontend should migrate older floating-format files by stripping persisted coordinates and keeping only the window identity fields plus the tree metadata.

### AI Desktop Context

The `getDesktopContext()` method changes its output format. Instead of listing window positions/sizes, it describes the tiling layout:

```
[Desktop Context]
Layout: horizontal split (50/50)
  Left: Note (focused)
  Right: vertical split (60/40)
    Top: Todo
    Bottom: File Explorer

Available MiniApps: note, todo, file-explorer, preference
```

This gives the AI a clearer mental model of the spatial arrangement.

---

## Migration Path

### Phase 1: Core Tree Logic

- Implement `TilingNode` types and tree manipulation functions (insert, remove, swap, find neighbors, traverse).
- Pure functions, fully unit-testable.
- No UI changes yet.

### Phase 2: Store Refactor

- Replace position/size/zIndex-based state with tree-based state in `useWindowManager`.
- Implement `computeLayout()`.
- Update `WindowSyncPayload` and backend persistence.

### Phase 3: Rendering

- Update `WindowChrome` to remove drag/resize.
- Update `Shell` desktop area to use computed tile rects.
- Add CSS transitions.

### Phase 4: Keyboard Shortcuts

- Implement `useKeyboardShortcuts` hook.
- Wire up all shortcuts (navigation, move, resize, fullscreen, close).

### Phase 5: Polish

- Update `ActionsBar` to replace Maximize with Fullscreen.
- Update `getDesktopContext()` for AI.
- Handle edge cases (minimized windows, single window, empty workspace).
- Update sync payload and backend persistence format.

---

## Open Questions

1. **Resize via mouse?** i3 allows dragging split borders with the mouse. Should we support this in addition to keyboard shortcuts? Likely yes for discoverability, but it's a Phase 5 enhancement.
2. **Split direction indicator** -- should there be a visual indicator showing which direction the next split will go?
3. **Workspace numbers** -- `Option + 1/2/3` is mapped to "focus Nth window" today. If we add virtual desktops, this mapping changes. Should we reserve these for future workspace switching and use a different shortcut for Nth-window focus?
4. **Maximum splits** -- should there be a limit on how many levels deep the tree can go? In practice, browser performance and available screen space are the natural limits.
