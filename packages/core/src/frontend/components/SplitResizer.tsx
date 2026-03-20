import React, { useCallback, useRef } from 'react';
import type { TreePath } from '../tiling-tree';
import { useWindowManager } from '../stores/window-manager';
import styles from './SplitResizer.module.scss';

interface SplitResizerProps {
  /** Path to the container node this resizer controls. */
  path: TreePath;
  /** Direction of the split: horizontal = vertical bar, vertical = horizontal bar. */
  split: 'horizontal' | 'vertical';
  /** Current ratio of the container. */
  ratio: number;
  onRatioChange?: (ratio: number) => void;
}

/**
 * A draggable divider between two tiled windows.
 *
 * - For horizontal splits (side-by-side), the bar is vertical → col-resize cursor.
 * - For vertical splits (top-and-bottom), the bar is horizontal → row-resize cursor.
 *
 * On drag, the component converts the pixel delta into a ratio delta
 * and calls `setNodeRatio` on the store.
 */
export function SplitResizer({ path, split, ratio, onRatioChange }: SplitResizerProps) {
  const startRef = useRef<{ clientX: number; clientY: number; startRatio: number } | null>(null);
  const resizerRef = useRef<HTMLDivElement | null>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startY = e.clientY;
      startRef.current = { clientX: startX, clientY: startY, startRatio: ratio };

      const container = resizerRef.current?.parentElement;
      const containerBounds = container?.getBoundingClientRect();
      if (!containerBounds) {
        return;
      }

      // Iframes swallow mouse events; disable their pointer events while resizing.
      const iframeBlocker = document.createElement('style');
      iframeBlocker.textContent = 'iframe { pointer-events: none !important; }';
      document.head.appendChild(iframeBlocker);

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!startRef.current) return;

        const dx = moveEvent.clientX - startRef.current.clientX;
        const dy = moveEvent.clientY - startRef.current.clientY;

        let ratioDelta: number;
        if (split === 'horizontal') {
          ratioDelta = containerBounds.width > 0 ? dx / containerBounds.width : 0;
        } else {
          ratioDelta = containerBounds.height > 0 ? dy / containerBounds.height : 0;
        }

        const newRatio = startRef.current.startRatio + ratioDelta;
        if (onRatioChange) {
          onRatioChange(newRatio);
        } else {
          useWindowManager.getState().setNodeRatio(path, newRatio);
        }
      };

      const handleMouseUp = () => {
        startRef.current = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        iframeBlocker.remove();
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = split === 'horizontal' ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';
    },
    [onRatioChange, path, split, ratio],
  );

  const isHorizontal = split === 'horizontal';

  const resizerClasses = [styles.resizer, isHorizontal ? styles.horizontal : styles.vertical]
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={resizerRef} className={resizerClasses} onMouseDown={handleMouseDown}>
      <div className={styles.bar} />
    </div>
  );
}
