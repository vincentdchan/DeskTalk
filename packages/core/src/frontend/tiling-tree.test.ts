import { describe, it, expect } from 'vitest';
import type { TilingNode, LeafNode, ContainerNode } from './tiling-tree';
import { relocateWindow, insertWindowAtEdge, getLeafIds, containsWindow } from './tiling-tree';

// ─── Helpers ────────────────────────────────────────────────────────────────

function leaf(id: string): LeafNode {
  return { type: 'leaf', windowId: id };
}

function container(
  split: 'horizontal' | 'vertical',
  first: TilingNode,
  second: TilingNode,
  ratio = 0.5,
): ContainerNode {
  return { type: 'container', split, ratio, children: [first, second] };
}

// ─── insertWindowAtEdge ─────────────────────────────────────────────────────

describe('insertWindowAtEdge', () => {
  it('inserts to the left of a leaf (source becomes first child, horizontal split)', () => {
    const tree = leaf('A');
    const result = insertWindowAtEdge(tree, 'A', 'B', 'left');

    expect(result).toEqual(container('horizontal', leaf('B'), leaf('A')));
  });

  it('inserts to the right of a leaf (source becomes second child, horizontal split)', () => {
    const tree = leaf('A');
    const result = insertWindowAtEdge(tree, 'A', 'B', 'right');

    expect(result).toEqual(container('horizontal', leaf('A'), leaf('B')));
  });

  it('inserts to the top of a leaf (source becomes first child, vertical split)', () => {
    const tree = leaf('A');
    const result = insertWindowAtEdge(tree, 'A', 'B', 'top');

    expect(result).toEqual(container('vertical', leaf('B'), leaf('A')));
  });

  it('inserts to the bottom of a leaf (source becomes second child, vertical split)', () => {
    const tree = leaf('A');
    const result = insertWindowAtEdge(tree, 'A', 'B', 'bottom');

    expect(result).toEqual(container('vertical', leaf('A'), leaf('B')));
  });

  it('recurses into the correct subtree to find the target', () => {
    const tree = container('horizontal', leaf('A'), leaf('B'));
    const result = insertWindowAtEdge(tree, 'B', 'C', 'left');

    // B should be split: C on left, B on right
    expect(result).toEqual(
      container('horizontal', leaf('A'), container('horizontal', leaf('C'), leaf('B'))),
    );
  });

  it('returns tree unchanged if target not found', () => {
    const tree = leaf('A');
    const result = insertWindowAtEdge(tree, 'Z', 'B', 'left');

    expect(result).toEqual(tree);
  });
});

// ─── relocateWindow ─────────────────────────────────────────────────────────

describe('relocateWindow', () => {
  describe('center (swap)', () => {
    it('swaps two windows in a horizontal split', () => {
      const tree = container('horizontal', leaf('A'), leaf('B'));
      const result = relocateWindow(tree, 'A', 'B', 'center');

      expect(getLeafIds(result)).toEqual(['B', 'A']);
    });

    it('swaps windows in a deeper tree', () => {
      const tree = container('horizontal', container('vertical', leaf('A'), leaf('B')), leaf('C'));
      const result = relocateWindow(tree, 'A', 'C', 'center');

      expect(containsWindow(result, 'A')).toBe(true);
      expect(containsWindow(result, 'C')).toBe(true);
      expect(getLeafIds(result)).toEqual(['C', 'B', 'A']);
    });
  });

  describe('left edge', () => {
    it('moves source to the left of target in a simple two-window split', () => {
      // [A | B] → drag B to left of A → [B | A]
      const tree = container('horizontal', leaf('A'), leaf('B'));
      const result = relocateWindow(tree, 'B', 'A', 'left');

      // After removing B, tree becomes leaf(A).
      // Then insert B to left of A → container(horizontal, B, A)
      expect(result).toEqual(container('horizontal', leaf('B'), leaf('A')));
    });

    it('moves source to the left of a non-sibling target', () => {
      // [A | [B / C]] → drag C to left of A
      const tree = container('horizontal', leaf('A'), container('vertical', leaf('B'), leaf('C')));
      const result = relocateWindow(tree, 'C', 'A', 'left');

      // After removing C: [A | B]
      // Insert C to left of A: [[C | A] | B]
      // but wait — after removing C, the tree becomes container(horizontal, A, B)
      // then insertWindowAtEdge on A with edge=left gives:
      // container(horizontal, container(horizontal, C, A), B)
      expect(result.type).toBe('container');
      const root = result as ContainerNode;
      expect(root.split).toBe('horizontal');
      expect(root.children[1]).toEqual(leaf('B'));

      const leftChild = root.children[0] as ContainerNode;
      expect(leftChild.split).toBe('horizontal');
      expect(leftChild.children[0]).toEqual(leaf('C'));
      expect(leftChild.children[1]).toEqual(leaf('A'));
    });
  });

  describe('right edge', () => {
    it('moves source to the right of target', () => {
      const tree = container('horizontal', leaf('A'), leaf('B'));
      const result = relocateWindow(tree, 'A', 'B', 'right');

      // After removing A, tree becomes leaf(B).
      // Insert A to right of B → container(horizontal, B, A)
      expect(result).toEqual(container('horizontal', leaf('B'), leaf('A')));
    });
  });

  describe('top edge', () => {
    it('moves source above target', () => {
      const tree = container('horizontal', leaf('A'), leaf('B'));
      const result = relocateWindow(tree, 'A', 'B', 'top');

      // After removing A, tree becomes leaf(B).
      // Insert A to top of B → container(vertical, A, B)
      expect(result).toEqual(container('vertical', leaf('A'), leaf('B')));
    });
  });

  describe('bottom edge', () => {
    it('moves source below target', () => {
      const tree = container('horizontal', leaf('A'), leaf('B'));
      const result = relocateWindow(tree, 'A', 'B', 'bottom');

      // After removing A, tree becomes leaf(B).
      // Insert A to bottom of B → container(vertical, B, A)
      expect(result).toEqual(container('vertical', leaf('B'), leaf('A')));
    });
  });

  describe('edge cases', () => {
    it('returns tree unchanged when source === target', () => {
      const tree = container('horizontal', leaf('A'), leaf('B'));
      const result = relocateWindow(tree, 'A', 'A', 'left');

      expect(result).toBe(tree);
    });

    it('returns tree unchanged when source not found', () => {
      const tree = container('horizontal', leaf('A'), leaf('B'));
      const result = relocateWindow(tree, 'Z', 'A', 'left');

      expect(result).toBe(tree);
    });

    it('returns tree unchanged when target not found', () => {
      const tree = container('horizontal', leaf('A'), leaf('B'));
      const result = relocateWindow(tree, 'A', 'Z', 'left');

      expect(result).toBe(tree);
    });

    it('handles siblings: relocating one sibling to a different edge of the other', () => {
      // [A | B] → drag A to bottom of B
      const tree = container('horizontal', leaf('A'), leaf('B'));
      const result = relocateWindow(tree, 'A', 'B', 'bottom');

      // Remove A → leaf(B), then insert A below B → container(vertical, B, A)
      expect(result).toEqual(container('vertical', leaf('B'), leaf('A')));
    });

    it('preserves all windows in a complex tree after relocation', () => {
      const tree = container(
        'horizontal',
        container('vertical', leaf('A'), leaf('B')),
        container('vertical', leaf('C'), leaf('D')),
      );
      const result = relocateWindow(tree, 'A', 'D', 'right');

      const ids = getLeafIds(result).sort();
      expect(ids).toEqual(['A', 'B', 'C', 'D']);
    });

    it('works in a three-level deep tree', () => {
      // [[A / B] | [C / D]]
      const tree = container(
        'horizontal',
        container('vertical', leaf('A'), leaf('B')),
        container('vertical', leaf('C'), leaf('D')),
      );
      const result = relocateWindow(tree, 'B', 'C', 'left');

      // After removing B: [A | [C / D]]
      // Insert B to left of C in the right subtree:
      // [A | [[B | C] / D]]
      const ids = getLeafIds(result);
      expect(ids).toEqual(['A', 'B', 'C', 'D']);

      // Verify structure: root is horizontal split
      expect(result.type).toBe('container');
      const root = result as ContainerNode;
      expect(root.split).toBe('horizontal');
      expect(root.children[0]).toEqual(leaf('A'));

      // Right child is a vertical split
      const rightChild = root.children[1] as ContainerNode;
      expect(rightChild.split).toBe('vertical');

      // First child of right is a horizontal split [B | C]
      const topRight = rightChild.children[0] as ContainerNode;
      expect(topRight.split).toBe('horizontal');
      expect(topRight.children[0]).toEqual(leaf('B'));
      expect(topRight.children[1]).toEqual(leaf('C'));

      expect(rightChild.children[1]).toEqual(leaf('D'));
    });
  });
});
