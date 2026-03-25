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
3. **Mouse-driven rearrangement** -- drag a window's title bar to relocate it to a new split position in any tile, similar to VSCode's editor drag-to-split.
4. **Fullscreen toggle** -- any window can go fullscreen and return to its tile.
5. **Single-window simplicity** -- when only one window is open it fills the entire workspace.
6. **Backward compatibility** -- the MiniApp API (`WindowState`, `openWindow`, `closeWindow`, `focusWindow`) stays the same from a MiniApp's perspective; tiling is purely a core concern.
7. **AI compatibility** -- the AI's `list_actions` / `invoke_action` pipeline is unaffected; desktop context just reports the tiling layout instead of pixel positions.

## Non-Goals

- Multi-monitor / multi-output support.
- Multiple workspaces / virtual desktops (may be added later).
- Tabbed containers (may be added later).
- Floating window escape hatch (all windows tile; the maximize/fullscreen toggle covers the primary use case for a single expanded window).
- Touch / trackpad drag gestures (may be added later by migrating to pointer events).

---

## Layout Model

### Tree Structure

Like i3, the layout is represented as a **binary split tree**:

```
Container (root)
 ├── Container (split=horizontal)
 │    ├── Leaf (Note)
 │    └── Leaf (Preview)
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

- **Remove** free-form drag-to-move and resize-handle interactions. Tiles are positioned by the tree, not by arbitrary user dragging.
- **Add** drag-to-reorder: the title bar acts as a drag handle for relocating the window to a different position in the tiling tree (see [Drag-to-Reorder](#drag-to-reorder-mouse-driven-layout-rearrangement) section).
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

## Drag-to-Reorder (Mouse-Driven Layout Rearrangement)

Keyboard shortcuts (`Option + Shift + H/J/K/L`) allow swapping a window with its spatial neighbor, but mouse users expect to rearrange layouts by dragging -- similar to how VSCode lets you drag an editor tab to split into a new area. This section specifies a drag-to-reorder system that complements the existing keyboard workflow.

### Interaction Flow

1. **Drag start.** The user presses and holds the mouse button on a window's **title bar** (the `.chrome` div). After the cursor moves beyond a 5 px dead-zone threshold, drag mode activates. The title bar already has `user-select: none`, so text selection is not a concern. Traffic-light buttons are excluded from drag initiation (clicks on them continue to close/fullscreen as before).

2. **Drag in progress.** While dragging:
   - The source window's tile gets a reduced-opacity treatment (e.g. `opacity: 0.5`, dashed border) to indicate it is being moved.
   - A transparent **drop-zone overlay** appears on top of every _other_ tile in the layout. As the cursor moves over a tile, the overlay highlights which **edge zone** the cursor is in, showing the user where the window will land.
   - If the cursor leaves the desktop area or returns to the source tile, no drop zone is highlighted.

3. **Drop.** On mouse-up:
   - If a valid drop zone is highlighted, the tree is restructured to relocate the source window to the target position.
   - If no valid drop zone is highlighted (e.g. the user released the mouse outside any tile, or back on the source tile), the drag is cancelled with no tree change.
   - Layout recomputation, backend sync, and focus transfer happen in the same store transaction as other tree mutations.

4. **Cancel.** Pressing `Escape` during a drag cancels it immediately.

### Drop Zone Geometry

Each target tile is divided into five hit zones based on the cursor's position relative to the tile's bounding rect:

```
┌──────────────────────┐
│         top           │  ← topmost 30% of tile height
├────┬────────────┬─────┤
│    │            │     │
│ L  │   center   │  R  │  ← middle 40% height × middle 40% width
│    │            │     │
├────┴────────────┴─────┤
│        bottom         │  ← bottommost 30% of tile height
└──────────────────────┘
       ↑           ↑
   leftmost 30%  rightmost 30%
   of tile width of tile width
```

Edge zones overlap at the corners; corners belong to the **top** or **bottom** zone (vertical edges take priority in overlap regions, matching VSCode behavior).

| Zone     | Visual indicator                           | Tree operation                        |
| -------- | ------------------------------------------ | ------------------------------------- |
| `left`   | Highlight the left half of the tile        | Horizontal split, source on the left  |
| `right`  | Highlight the right half of the tile       | Horizontal split, source on the right |
| `top`    | Highlight the top half of the tile         | Vertical split, source on top         |
| `bottom` | Highlight the bottom half of the tile      | Vertical split, source on the bottom  |
| `center` | Highlight the entire tile (swap indicator) | Swap source and target positions      |

The visual indicator is a semi-transparent rectangle (`var(--dt-accent)` at ~20% opacity, `2px dashed var(--dt-accent)` border) drawn over the corresponding region. A ~100 ms CSS transition smooths zone changes as the cursor moves.

### Tree Operation: `relocateWindow`

A new pure function is added to `tiling-tree.ts`:

```ts
function relocateWindow(
  tree: TilingNode,
  sourceWindowId: string,
  targetWindowId: string,
  edge: 'left' | 'right' | 'top' | 'bottom' | 'center',
): TilingNode;
```

**Behavior by edge:**

- **`center`**: Delegates to the existing `swapWindows(tree, sourceWindowId, targetWindowId)`.
- **`left` / `right` / `top` / `bottom`**:
  1. Remove the source leaf from the tree using `removeWindow(tree, sourceWindowId)`. The source's sibling is promoted to replace the parent container (standard removal semantics).
  2. Find the target leaf in the resulting tree.
  3. Replace the target leaf with a new container whose:
     - `split` is `'horizontal'` for `left`/`right`, `'vertical'` for `top`/`bottom`.
     - `children` order depends on the edge: for `left` or `top`, source is `children[0]` and target is `children[1]`; for `right` or `bottom`, target is `children[0]` and source is `children[1]`.
     - `ratio` defaults to `0.5`.

This is a composition of existing primitives (`removeWindow` + a targeted `insertWindow` variant), ensuring the tree invariants (binary, no empty containers) are preserved.

**Edge cases:**

| Scenario                                                | Behavior                                                                                                                                                                                            |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source and target are the same window                   | No-op (cancelled by the drag system before reaching the tree function).                                                                                                                             |
| Source and target are siblings                          | Removal promotes the target, then the target is split again with the source. The net effect is that the source moves to the specified edge of the target, potentially changing the split direction. |
| Only one window in the tree                             | Drag is disabled (no valid drop targets).                                                                                                                                                           |
| Source is the only child after removal leaves null tree | Cannot happen -- there must be at least the target window remaining.                                                                                                                                |

### Drag State Store

Drag state is **transient and high-frequency** (updated every mouse move). To avoid unnecessary backend syncs and layout recomputations on each cursor movement, drag state lives in a **separate Zustand store** (`useDragStore`), isolated from the main `useWindowManager`:

```ts
interface DragState {
  isDragging: boolean;
  dragWindowId: string | null;
  dragStartPos: { x: number; y: number } | null;
  dropTarget: {
    windowId: string;
    edge: 'left' | 'right' | 'top' | 'bottom' | 'center';
  } | null;
}

interface DragActions {
  startDrag(windowId: string, mousePos: { x: number; y: number }): void;
  updateDropTarget(windowId: string, edge: DragState['dropTarget']['edge']): void;
  clearDropTarget(): void;
  executeDrop(): void; // calls useWindowManager.getState().relocateWindow(...)
  cancelDrag(): void;
}
```

Only `executeDrop` crosses into `useWindowManager` -- all other drag actions are local state changes that only affect overlay rendering.

### Component Changes

#### `WindowChrome.tsx`

- Add a `mousedown` handler on the `.chrome` div (excluding traffic-light buttons).
- On `mousedown`, record the start position. Attach `mousemove` and `mouseup` listeners to `document`.
- After the cursor exceeds the 5 px dead-zone threshold, call `useDragStore.getState().startDrag(windowId, pos)`.
- On `mouseup`, call `executeDrop()` or `cancelDrag()` depending on whether a valid `dropTarget` exists.
- Clean up document-level listeners on drop, cancel, or component unmount.
- When the current window is being dragged (`isDragging && dragWindowId === win.id`), apply a `.dragging` CSS class to reduce opacity and show a dashed border.

#### `DropZoneOverlay.tsx` (new component)

- Rendered by `Shell` as a sibling of the tiling tree, **above** it in z-order but below the fullscreen overlay.
- Only mounts when `useDragStore(s => s.isDragging)` is true.
- Reads `tileRects` from `useWindowManager` to know the pixel position of every tile.
- For each tile (excluding the source window's tile), renders an invisible overlay div at the tile's rect.
- On `mousemove` over each overlay div, computes which edge zone the cursor is in and calls `updateDropTarget(targetWindowId, edge)`.
- Renders the visual highlight indicator based on the current `dropTarget`.

#### `DropZoneOverlay.module.scss` (new stylesheet)

Colocated with the component. Provides:

- `.overlay` -- fixed/absolute positioned container covering the desktop area, `pointer-events: none`.
- `.tileZone` -- per-tile overlay positioned at the tile's rect, `pointer-events: all`.
- `.highlight` -- the accent-colored indicator, positioned to cover the relevant half (or whole) of the tile. Uses `background: var(--dt-accent)` at 20% opacity, dashed border, ~100 ms transition.

#### `Shell.tsx`

- Import and conditionally render `<DropZoneOverlay />` when `useDragStore(s => s.isDragging)` is true.
- Add a `keydown` listener for `Escape` that calls `cancelDrag()` during an active drag.

#### `WindowChrome.module.scss`

- Add a `.dragging` class: `opacity: 0.5; border: 2px dashed var(--dt-accent);`

### Store Action: `relocateWindow`

A new action is added to `useWindowManager`:

```ts
relocateWindow(
  sourceWindowId: string,
  targetWindowId: string,
  edge: 'left' | 'right' | 'top' | 'bottom' | 'center',
): void;
```

This action:

1. Calls the pure `relocateWindow()` tree function.
2. Recomputes layout via `recomputeLayout()`.
3. Updates `windows` metadata via `updateWindowRectsFromTree()`.
4. Focuses the relocated window.
5. Syncs to backend via `syncToBackend()`.

### Edge Cases and Constraints

- **Single window:** Drag is not initiated when only one window exists (nothing to drop onto).
- **Fullscreen mode:** If a window is fullscreened, drag is disabled. Alternatively, starting a drag exits fullscreen first.
- **Minimum tile size:** The existing `clampRatio` (min 0.15) prevents tiles from becoming too narrow after relocation. No additional minimum-size enforcement is needed for the initial implementation.
- **Animation:** The CSS Grid layout in `Shell` already transitions smoothly when `grid-template-columns` / `grid-template-rows` change. The relocation will animate naturally via the existing grid-based rendering.
- **Touch support:** Out of scope for the initial implementation. The pointer-capture pattern can be extended to `pointerdown`/`pointermove`/`pointerup` events later for touch device support.

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
    { "id": "win-2", "miniAppId": "preview", "title": "Preview" }
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
    Top: Preview
    Bottom: File Explorer

Available MiniApps: note, file-explorer, preview, preference
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

### Phase 6: Drag-to-Reorder

Adds mouse-driven layout rearrangement (VSCode-style drag-to-split).

#### Phase 6a: Tree Operation

- Implement `relocateWindow()` in `tiling-tree.ts`.
- Unit test all five edge values (`left`, `right`, `top`, `bottom`, `center`), sibling relocation, and error cases.

#### Phase 6b: Drag State Store

- Create `useDragStore` (transient Zustand store).
- Implement `startDrag`, `updateDropTarget`, `clearDropTarget`, `executeDrop`, `cancelDrag` actions.

#### Phase 6c: Drag Initiation

- Add `mousedown` handler to `WindowChrome` title bar.
- Implement dead-zone threshold (5 px) before entering drag mode.
- Attach `mousemove`/`mouseup` listeners to `document` during drag.
- Add `.dragging` CSS class for visual feedback on source window.

#### Phase 6d: Drop Zone Overlay

- Create `DropZoneOverlay` component with colocated `.module.scss`.
- Implement five-zone hit detection per tile (left/right/top/bottom/center).
- Render accent-colored highlight indicator showing the drop target area.
- Mount overlay in `Shell` when `isDragging` is true.

#### Phase 6e: Wiring and Integration

- Add `relocateWindow` action to `useWindowManager` store.
- Wire `executeDrop` to call the store action.
- Add `Escape` key handler for drag cancellation.
- Handle edge cases: single window, fullscreen mode, drop on self.

---

## Open Questions

1. **Resize via mouse?** i3 allows dragging split borders with the mouse. Should we support this in addition to keyboard shortcuts? Likely yes for discoverability, but it's a Phase 5 enhancement.
2. **Split direction indicator** -- should there be a visual indicator showing which direction the next split will go?
3. **Workspace numbers** -- `Option + 1/2/3` is mapped to "focus Nth window" today. If we add virtual desktops, this mapping changes. Should we reserve these for future workspace switching and use a different shortcut for Nth-window focus?
4. **Maximum splits** -- should there be a limit on how many levels deep the tree can go? In practice, browser performance and available screen space are the natural limits.
5. **Drag ghost preview** -- should a translucent clone of the title bar follow the cursor during drag? The initial implementation uses only opacity reduction on the source tile, but a floating ghost (like VSCode) could improve discoverability. Consider adding this as a polish enhancement.
6. **Touch and pointer events** -- the initial drag implementation uses `mousedown`/`mousemove`/`mouseup`. Should this be migrated to `pointerdown`/`pointermove`/`pointerup` to support trackpad and touch devices from the start?
7. **Cross-drop-zone animation** -- should the highlight indicator animate between zones as the cursor moves across a tile, or snap instantly? A short CSS transition (~100 ms) is specified, but this may feel sluggish if zone boundaries are crossed rapidly.
