import React, { useCallback } from 'react';
import type { DropEdge } from '../tiling-tree';
import type { TileRect } from '../tiling-tree';
import { useDragStore } from '../stores/drag-store';
import { useWindowManager } from '../stores/window-manager';
import styles from './DropZoneOverlay.module.scss';

/**
 * Determine which drop zone edge the cursor is in relative to a tile rect.
 *
 * Zone layout (matching the spec):
 *   - Top/bottom zones: 30% of height, full width (take priority at corners)
 *   - Left/right zones: 30% of width, middle 40% of height
 *   - Center: middle 40% of both dimensions
 */
function hitTestEdge(
  clientX: number,
  clientY: number,
  rect: TileRect,
  desktopEl: HTMLElement,
): DropEdge {
  const desktopRect = desktopEl.getBoundingClientRect();
  // Convert tile rect (relative to desktop) to screen coordinates
  const tileScreenX = desktopRect.left + rect.x;
  const tileScreenY = desktopRect.top + rect.y;

  const relX = clientX - tileScreenX;
  const relY = clientY - tileScreenY;

  const fracX = rect.width > 0 ? relX / rect.width : 0.5;
  const fracY = rect.height > 0 ? relY / rect.height : 0.5;

  // Vertical edges take priority at corners (top/bottom checked first)
  if (fracY < 0.3) return 'top';
  if (fracY > 0.7) return 'bottom';
  if (fracX < 0.3) return 'left';
  if (fracX > 0.7) return 'right';
  return 'center';
}

/**
 * Compute the CSS style for the highlight indicator based on the drop edge.
 */
function highlightStyle(edge: DropEdge): React.CSSProperties {
  switch (edge) {
    case 'left':
      return { left: 0, top: 0, width: '50%', height: '100%' };
    case 'right':
      return { right: 0, top: 0, width: '50%', height: '100%' };
    case 'top':
      return { left: 0, top: 0, width: '100%', height: '50%' };
    case 'bottom':
      return { left: 0, bottom: 0, width: '100%', height: '50%' };
    case 'center':
      return { left: 0, top: 0, width: '100%', height: '100%' };
  }
}

interface DropZoneOverlayProps {
  /** Ref to the desktop container element (needed for coordinate mapping). */
  desktopRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Overlay rendered during a drag-to-reorder operation.
 *
 * Covers each tile (except the source) with invisible hit zones.
 * Shows a visual highlight indicating where the window would land.
 */
export function DropZoneOverlay({ desktopRef }: DropZoneOverlayProps) {
  const dragWindowId = useDragStore((s) => s.dragWindowId);
  const dropTarget = useDragStore((s) => s.dropTarget);
  const tileRects = useWindowManager((s) => s.tileRects);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent, rect: TileRect) => {
      const el = desktopRef.current;
      if (!el) return;
      const edge = hitTestEdge(e.clientX, e.clientY, rect, el);
      useDragStore.getState().updateDropTarget(rect.windowId, edge);
    },
    [desktopRef],
  );

  const handleMouseLeave = useCallback(() => {
    useDragStore.getState().clearDropTarget();
  }, []);

  // Filter out the source window's tile
  const targetRects = tileRects.filter((r) => r.windowId !== dragWindowId);

  return (
    <div className={styles.overlay}>
      {targetRects.map((rect) => {
        const isActive = dropTarget?.windowId === rect.windowId;

        return (
          <div
            key={rect.windowId}
            className={styles.tileZone}
            style={{
              left: rect.x,
              top: rect.y,
              width: rect.width,
              height: rect.height,
            }}
            onMouseMove={(e) => handleMouseMove(e, rect)}
            onMouseLeave={handleMouseLeave}
          >
            {isActive && dropTarget && (
              <div className={styles.highlight} style={highlightStyle(dropTarget.edge)} />
            )}
          </div>
        );
      })}
    </div>
  );
}
