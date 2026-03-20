/**
 * Tiling tree types and pure manipulation functions.
 *
 * The tiling layout is represented as a binary split tree where every node
 * is either a Leaf (holding one window) or a Container (holding two children
 * with a split direction and ratio).
 */

// ─── Node Types ──────────────────────────────────────────────────────────────

export interface LeafNode {
  type: 'leaf';
  windowId: string;
}

export interface ContainerNode {
  type: 'container';
  /** horizontal = side-by-side (left/right), vertical = top-and-bottom */
  split: 'horizontal' | 'vertical';
  /** Proportion of space allocated to the first child (0.0–1.0) */
  ratio: number;
  children: [TilingNode, TilingNode];
}

export type TilingNode = LeafNode | ContainerNode;

// ─── Layout Computation ──────────────────────────────────────────────────────

export interface TileRect {
  windowId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Recursively compute pixel rectangles for every leaf in the tree.
 */
export function computeLayout(node: TilingNode, bounds: Bounds, gap: number): TileRect[] {
  if (node.type === 'leaf') {
    return [
      {
        windowId: node.windowId,
        x: bounds.x + gap,
        y: bounds.y + gap,
        width: Math.max(bounds.width - gap * 2, 0),
        height: Math.max(bounds.height - gap * 2, 0),
      },
    ];
  }

  const { split, ratio, children } = node;
  const halfGap = gap / 2;

  if (split === 'horizontal') {
    const firstWidth = Math.round(bounds.width * ratio);
    const secondWidth = bounds.width - firstWidth;
    return [
      ...computeLayout(children[0], { ...bounds, width: firstWidth - halfGap }, gap),
      ...computeLayout(
        children[1],
        {
          x: bounds.x + firstWidth + halfGap,
          y: bounds.y,
          width: secondWidth - halfGap,
          height: bounds.height,
        },
        gap,
      ),
    ];
  }

  // vertical
  const firstHeight = Math.round(bounds.height * ratio);
  const secondHeight = bounds.height - firstHeight;
  return [
    ...computeLayout(children[0], { ...bounds, height: firstHeight - halfGap }, gap),
    ...computeLayout(
      children[1],
      {
        x: bounds.x,
        y: bounds.y + firstHeight + halfGap,
        width: bounds.width,
        height: secondHeight - halfGap,
      },
      gap,
    ),
  ];
}

// ─── Tree Queries ────────────────────────────────────────────────────────────

/** Collect all window IDs in left-to-right, top-to-bottom order. */
export function getLeafIds(node: TilingNode): string[] {
  if (node.type === 'leaf') return [node.windowId];
  return [...getLeafIds(node.children[0]), ...getLeafIds(node.children[1])];
}

/** Find the leaf node for a given windowId. */
export function findLeaf(node: TilingNode, windowId: string): LeafNode | null {
  if (node.type === 'leaf') {
    return node.windowId === windowId ? node : null;
  }
  return findLeaf(node.children[0], windowId) ?? findLeaf(node.children[1], windowId);
}

/** Check whether a windowId exists in the tree. */
export function containsWindow(node: TilingNode, windowId: string): boolean {
  return findLeaf(node, windowId) !== null;
}

/**
 * Return the depth of a given windowId in the tree (root = 0).
 * Returns -1 if not found.
 */
export function getDepth(node: TilingNode, windowId: string, depth = 0): number {
  if (node.type === 'leaf') {
    return node.windowId === windowId ? depth : -1;
  }
  const left = getDepth(node.children[0], windowId, depth + 1);
  if (left >= 0) return left;
  return getDepth(node.children[1], windowId, depth + 1);
}

// ─── Tree Mutations (all return new trees — immutable) ──────────────────────

/**
 * Insert a new window by splitting the leaf that holds `targetWindowId`.
 * The existing window becomes the first child, the new window becomes the second.
 */
export function insertWindow(
  node: TilingNode,
  targetWindowId: string,
  newWindowId: string,
  splitDirection: 'horizontal' | 'vertical' | 'auto',
): TilingNode {
  if (node.type === 'leaf') {
    if (node.windowId !== targetWindowId) return node;

    const direction =
      splitDirection === 'auto'
        ? autoSplitDirection(getDepth({ type: 'leaf', windowId: targetWindowId }, targetWindowId))
        : splitDirection;

    return {
      type: 'container',
      split: direction,
      ratio: 0.5,
      children: [
        { type: 'leaf', windowId: targetWindowId },
        { type: 'leaf', windowId: newWindowId },
      ],
    };
  }

  // Recurse — try left first, then right
  if (containsWindow(node.children[0], targetWindowId)) {
    return {
      ...node,
      children: [
        insertWindow(node.children[0], targetWindowId, newWindowId, splitDirection),
        node.children[1],
      ],
    };
  }

  return {
    ...node,
    children: [
      node.children[0],
      insertWindow(node.children[1], targetWindowId, newWindowId, splitDirection),
    ],
  };
}

/**
 * Remove a window from the tree. Its sibling is promoted to replace the parent container.
 * Returns null if the tree becomes empty.
 */
export function removeWindow(node: TilingNode, windowId: string): TilingNode | null {
  if (node.type === 'leaf') {
    return node.windowId === windowId ? null : node;
  }

  const [left, right] = node.children;

  // If left child is the target leaf, promote right
  if (left.type === 'leaf' && left.windowId === windowId) return right;
  // If right child is the target leaf, promote left
  if (right.type === 'leaf' && right.windowId === windowId) return left;

  // Recurse into whichever subtree contains the window
  if (containsWindow(left, windowId)) {
    const newLeft = removeWindow(left, windowId);
    if (newLeft === null) return right;
    return { ...node, children: [newLeft, right] };
  }

  if (containsWindow(right, windowId)) {
    const newRight = removeWindow(right, windowId);
    if (newRight === null) return left;
    return { ...node, children: [left, newRight] };
  }

  // Window not in this subtree
  return node;
}

/**
 * Swap two windows' positions in the tree.
 */
export function swapWindows(node: TilingNode, idA: string, idB: string): TilingNode {
  if (node.type === 'leaf') {
    if (node.windowId === idA) return { type: 'leaf', windowId: idB };
    if (node.windowId === idB) return { type: 'leaf', windowId: idA };
    return node;
  }

  return {
    ...node,
    children: [swapWindows(node.children[0], idA, idB), swapWindows(node.children[1], idA, idB)],
  };
}

/**
 * Adjust the split ratio of the container that directly holds the given windowId.
 * `delta` is added to the ratio (positive = give more space to first child).
 * The window may be either the first or second child.
 */
export function adjustRatio(node: TilingNode, windowId: string, delta: number): TilingNode {
  if (node.type === 'leaf') return node;

  const [left, right] = node.children;

  // Direct parent of the target?
  const leftContains =
    (left.type === 'leaf' && left.windowId === windowId) || containsWindow(left, windowId);
  const rightContains =
    (right.type === 'leaf' && right.windowId === windowId) || containsWindow(right, windowId);

  if (leftContains && !rightContains) {
    // Check if this is the direct parent (child is a leaf with this id)
    if (left.type === 'leaf' && left.windowId === windowId) {
      return {
        ...node,
        ratio: clampRatio(node.ratio + delta),
      };
    }
    // Recurse deeper first; if it changed nothing at a deeper level, adjust here
    const adjusted = adjustRatio(left, windowId, delta);
    if (adjusted === left) {
      // No deeper container found — adjust this node
      return { ...node, ratio: clampRatio(node.ratio + delta) };
    }
    return { ...node, children: [adjusted, right] };
  }

  if (rightContains && !leftContains) {
    if (right.type === 'leaf' && right.windowId === windowId) {
      // Window is second child — a positive delta shrinks it, so negate
      return {
        ...node,
        ratio: clampRatio(node.ratio - delta),
      };
    }
    const adjusted = adjustRatio(right, windowId, delta);
    if (adjusted === right) {
      return { ...node, ratio: clampRatio(node.ratio - delta) };
    }
    return { ...node, children: [left, adjusted] };
  }

  return node;
}

/**
 * Reset the ratio of the direct parent container of the given window to 0.5.
 */
export function equalizeRatio(node: TilingNode, windowId: string): TilingNode {
  if (node.type === 'leaf') return node;

  const [left, right] = node.children;

  // Direct parent?
  if (
    (left.type === 'leaf' && left.windowId === windowId) ||
    (right.type === 'leaf' && right.windowId === windowId)
  ) {
    return { ...node, ratio: 0.5 };
  }

  if (containsWindow(left, windowId)) {
    return { ...node, children: [equalizeRatio(left, windowId), right] };
  }
  if (containsWindow(right, windowId)) {
    return { ...node, children: [left, equalizeRatio(right, windowId)] };
  }

  return node;
}

/**
 * Toggle the split direction of the container that directly holds the given window.
 */
export function rotateSplit(node: TilingNode, windowId: string): TilingNode {
  if (node.type === 'leaf') return node;

  const [left, right] = node.children;

  if (
    (left.type === 'leaf' && left.windowId === windowId) ||
    (right.type === 'leaf' && right.windowId === windowId)
  ) {
    return {
      ...node,
      split: node.split === 'horizontal' ? 'vertical' : 'horizontal',
    };
  }

  if (containsWindow(left, windowId)) {
    return { ...node, children: [rotateSplit(left, windowId), right] };
  }
  if (containsWindow(right, windowId)) {
    return { ...node, children: [left, rotateSplit(right, windowId)] };
  }

  return node;
}

// ─── Relocate (drag-to-reorder) ─────────────────────────────────────────────

export type DropEdge = 'left' | 'right' | 'top' | 'bottom' | 'center';

/**
 * Insert `newWindowId` as a neighbor of `targetWindowId` at the specified edge.
 *
 * Unlike `insertWindow` (which always puts the new window as the second child),
 * this function controls child ordering based on the edge:
 * - `left` / `top`: new window is children[0], target is children[1]
 * - `right` / `bottom`: target is children[0], new window is children[1]
 */
export function insertWindowAtEdge(
  node: TilingNode,
  targetWindowId: string,
  newWindowId: string,
  edge: 'left' | 'right' | 'top' | 'bottom',
): TilingNode {
  if (node.type === 'leaf') {
    if (node.windowId !== targetWindowId) return node;

    const split: 'horizontal' | 'vertical' =
      edge === 'left' || edge === 'right' ? 'horizontal' : 'vertical';

    const first: LeafNode =
      edge === 'left' || edge === 'top'
        ? { type: 'leaf', windowId: newWindowId }
        : { type: 'leaf', windowId: targetWindowId };

    const second: LeafNode =
      edge === 'left' || edge === 'top'
        ? { type: 'leaf', windowId: targetWindowId }
        : { type: 'leaf', windowId: newWindowId };

    return {
      type: 'container',
      split,
      ratio: 0.5,
      children: [first, second],
    };
  }

  // Recurse into whichever subtree contains the target
  if (containsWindow(node.children[0], targetWindowId)) {
    return {
      ...node,
      children: [
        insertWindowAtEdge(node.children[0], targetWindowId, newWindowId, edge),
        node.children[1],
      ],
    };
  }

  return {
    ...node,
    children: [
      node.children[0],
      insertWindowAtEdge(node.children[1], targetWindowId, newWindowId, edge),
    ],
  };
}

/**
 * Relocate a window from its current position to a new position relative to
 * a target window.
 *
 * - `center`: swaps the source and target (delegates to `swapWindows`).
 * - `left`/`right`/`top`/`bottom`: removes the source from the tree, then
 *   inserts it adjacent to the target on the specified edge.
 *
 * Returns the original tree unchanged if source === target or either window
 * is not found in the tree.
 */
export function relocateWindow(
  tree: TilingNode,
  sourceWindowId: string,
  targetWindowId: string,
  edge: DropEdge,
): TilingNode {
  // No-op: same window
  if (sourceWindowId === targetWindowId) return tree;

  // Both windows must exist
  if (!containsWindow(tree, sourceWindowId) || !containsWindow(tree, targetWindowId)) {
    return tree;
  }

  // Center = swap
  if (edge === 'center') {
    return swapWindows(tree, sourceWindowId, targetWindowId);
  }

  // 1. Remove source from the tree
  const treeAfterRemoval = removeWindow(tree, sourceWindowId);
  if (!treeAfterRemoval) {
    // Should not happen since the target is still in the tree
    return tree;
  }

  // 2. Insert source adjacent to the target at the specified edge
  return insertWindowAtEdge(treeAfterRemoval, targetWindowId, sourceWindowId, edge);
}

// ─── Directional Navigation ─────────────────────────────────────────────────

export type Direction = 'left' | 'right' | 'up' | 'down';

/**
 * Find the neighboring window in a given direction.
 * Uses the computed layout rects to determine spatial neighbors.
 */
export function findNeighbor(
  rects: TileRect[],
  currentWindowId: string,
  direction: Direction,
): string | null {
  const current = rects.find((r) => r.windowId === currentWindowId);
  if (!current) return null;

  const cx = current.x + current.width / 2;
  const cy = current.y + current.height / 2;

  let bestId: string | null = null;
  let bestDist = Infinity;

  for (const rect of rects) {
    if (rect.windowId === currentWindowId) continue;

    const rx = rect.x + rect.width / 2;
    const ry = rect.y + rect.height / 2;

    let valid = false;
    switch (direction) {
      case 'left':
        valid = rx < cx;
        break;
      case 'right':
        valid = rx > cx;
        break;
      case 'up':
        valid = ry < cy;
        break;
      case 'down':
        valid = ry > cy;
        break;
    }

    if (valid) {
      const dist = Math.abs(rx - cx) + Math.abs(ry - cy);
      if (dist < bestDist) {
        bestDist = dist;
        bestId = rect.windowId;
      }
    }
  }

  return bestId;
}

// ─── Describe (for AI context) ──────────────────────────────────────────────

/**
 * Build a human-readable description of the tiling layout for AI context.
 * Maps windowId -> title via the provided lookup.
 */
export function describeLayout(
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

// ─── Split Bar Computation (for draggable resizers) ─────────────────────────

/** Path from the root to a specific container node: 0 = left/top child, 1 = right/bottom child. */
export type TreePath = (0 | 1)[];

export interface SplitBar {
  /** Path to the container node that owns this split. */
  path: TreePath;
  /** Direction of the split (horizontal = vertical bar, vertical = horizontal bar). */
  split: 'horizontal' | 'vertical';
  /** Current ratio of the container. */
  ratio: number;
  /** Pixel position & size of the resizer hit-area. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Walk the tiling tree and compute a SplitBar for every ContainerNode.
 * Each bar sits on the dividing line between the two children.
 */
export function computeSplitBars(
  node: TilingNode,
  bounds: Bounds,
  gap: number,
  path: TreePath = [],
): SplitBar[] {
  if (node.type === 'leaf') return [];

  const { split, ratio, children } = node;
  const bars: SplitBar[] = [];

  if (split === 'horizontal') {
    const splitX = bounds.x + Math.round(bounds.width * ratio);
    const halfGap = gap / 2;

    bars.push({
      path,
      split,
      ratio,
      x: splitX - halfGap,
      y: bounds.y,
      width: gap,
      height: bounds.height,
    });

    // Recurse into children with their sub-bounds
    const leftBounds: Bounds = { ...bounds, width: Math.round(bounds.width * ratio) - halfGap };
    const rightBounds: Bounds = {
      x: bounds.x + Math.round(bounds.width * ratio) + halfGap,
      y: bounds.y,
      width: bounds.width - Math.round(bounds.width * ratio) - halfGap,
      height: bounds.height,
    };

    bars.push(...computeSplitBars(children[0], leftBounds, gap, [...path, 0]));
    bars.push(...computeSplitBars(children[1], rightBounds, gap, [...path, 1]));
  } else {
    // vertical split
    const splitY = bounds.y + Math.round(bounds.height * ratio);
    const halfGap = gap / 2;

    bars.push({
      path,
      split,
      ratio,
      x: bounds.x,
      y: splitY - halfGap,
      width: bounds.width,
      height: gap,
    });

    const topBounds: Bounds = { ...bounds, height: Math.round(bounds.height * ratio) - halfGap };
    const bottomBounds: Bounds = {
      x: bounds.x,
      y: bounds.y + Math.round(bounds.height * ratio) + halfGap,
      width: bounds.width,
      height: bounds.height - Math.round(bounds.height * ratio) - halfGap,
    };

    bars.push(...computeSplitBars(children[0], topBounds, gap, [...path, 0]));
    bars.push(...computeSplitBars(children[1], bottomBounds, gap, [...path, 1]));
  }

  return bars;
}

/**
 * Set the ratio of a ContainerNode at the given path in the tree.
 * Returns a new tree (immutable).
 */
export function setRatioAtPath(node: TilingNode, path: TreePath, newRatio: number): TilingNode {
  if (path.length === 0) {
    // We've arrived at the target node
    if (node.type !== 'container') return node;
    return { ...node, ratio: clampRatio(newRatio) };
  }

  if (node.type !== 'container') return node;

  const [head, ...rest] = path;
  const newChildren: [TilingNode, TilingNode] = [node.children[0], node.children[1]];
  newChildren[head] = setRatioAtPath(node.children[head], rest, newRatio);
  return { ...node, children: newChildren };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clampRatio(ratio: number): number {
  return Math.min(Math.max(ratio, 0.15), 0.85);
}

function autoSplitDirection(depth: number): 'horizontal' | 'vertical' {
  return depth % 2 === 0 ? 'horizontal' : 'vertical';
}
