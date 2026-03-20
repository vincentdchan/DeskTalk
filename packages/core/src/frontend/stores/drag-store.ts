import { create } from 'zustand';
import type { DropEdge } from '../tiling-tree';

/**
 * Transient drag state for window title-bar drag-to-reorder.
 *
 * This store is intentionally separate from `useWindowManager` because:
 * - Drag state is updated on every mouse move (high frequency).
 * - It should NOT trigger backend sync or layout recomputation.
 * - Only the drop-zone overlay and the source window's visual treatment
 *   subscribe to this state.
 */

export interface DropTarget {
  windowId: string;
  edge: DropEdge;
}

interface DragState {
  isDragging: boolean;
  dragWindowId: string | null;
  dropTarget: DropTarget | null;
}

interface DragActions {
  startDrag: (windowId: string) => void;
  updateDropTarget: (windowId: string, edge: DropEdge) => void;
  clearDropTarget: () => void;
  /** Commit the drag: returns the drop info if valid, then resets state. */
  finishDrag: () => { sourceWindowId: string; target: DropTarget } | null;
  cancelDrag: () => void;
}

const INITIAL_STATE: DragState = {
  isDragging: false,
  dragWindowId: null,
  dropTarget: null,
};

export const useDragStore = create<DragState & DragActions>((set, get) => ({
  ...INITIAL_STATE,

  startDrag(windowId: string) {
    set({ isDragging: true, dragWindowId: windowId, dropTarget: null });
  },

  updateDropTarget(windowId: string, edge: DropEdge) {
    const state = get();
    // Don't set target on the source window
    if (windowId === state.dragWindowId) {
      set({ dropTarget: null });
      return;
    }
    const current = state.dropTarget;
    if (current && current.windowId === windowId && current.edge === edge) {
      return; // no change
    }
    set({ dropTarget: { windowId, edge } });
  },

  clearDropTarget() {
    if (get().dropTarget !== null) {
      set({ dropTarget: null });
    }
  },

  finishDrag() {
    const state = get();
    const result =
      state.isDragging && state.dragWindowId && state.dropTarget
        ? { sourceWindowId: state.dragWindowId, target: state.dropTarget }
        : null;

    set(INITIAL_STATE);
    return result;
  },

  cancelDrag() {
    set(INITIAL_STATE);
  },
}));
