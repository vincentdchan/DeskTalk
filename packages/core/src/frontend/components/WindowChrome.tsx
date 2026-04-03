import React, { useCallback, useEffect, useRef } from 'react';
import type { WindowState } from '@desktalk/sdk';
import { useWindowManager } from '../stores/window-manager';
import { useDragStore } from '../stores/drag-store';
import styles from './WindowChrome.module.scss';

const DRAG_DEAD_ZONE = 5; // px before drag activates

interface WindowChromeProps {
  window: WindowState;
  /** Pixel rect from tiling layout. When provided, positions the window absolutely. */
  tileRect?: { x: number; y: number; width: number; height: number };
  title?: string;
  isFocused?: boolean;
  showCloseButton?: boolean;
  showFullscreenButton?: boolean;
  /** When true, title-bar drag-to-reorder is enabled for this window. */
  draggable?: boolean;
  onFocus?: () => void;
  isOverlayMaximized?: boolean;
  children: React.ReactNode;
}

export function WindowChrome({
  window: win,
  tileRect,
  title,
  isFocused,
  showCloseButton = true,
  showFullscreenButton = true,
  draggable = false,
  onFocus,
  isOverlayMaximized = false,
  children,
}: WindowChromeProps) {
  const windowRef = useRef<HTMLDivElement | null>(null);
  const fullscreenWindowId = useWindowManager((s) => s.fullscreenWindowId);
  const isFullscreen = win.id === fullscreenWindowId;
  const focused = isFocused ?? win.focused;

  const isDragging = useDragStore((s) => s.isDragging && s.dragWindowId === win.id);

  // Track whether we're in a potential drag gesture so we can avoid triggering
  // focus changes on mouseup after a successful drag.
  const dragGestureRef = useRef<{
    startX: number;
    startY: number;
    activated: boolean;
  } | null>(null);

  const handleFocus = useCallback(() => {
    if (onFocus) {
      onFocus();
      return;
    }

    const state = useWindowManager.getState();
    if (state.focusedWindowId !== win.id) {
      state.focusWindow(win.id);
    }
  }, [onFocus, win.id]);

  // Clean up document listeners if the component unmounts during a drag
  useEffect(() => {
    return () => {
      dragGestureRef.current = null;
    };
  }, []);

  const handleChromeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only respond to primary button, and only when draggable
      if (!draggable || e.button !== 0) return;

      // Don't initiate drag from traffic-light buttons
      const target = e.target as HTMLElement;
      if (target.closest('button')) return;

      // Don't initiate drag when fullscreened
      const wmState = useWindowManager.getState();
      if (wmState.fullscreenWindowId) return;

      // Record the start position for dead-zone checking
      const startX = e.clientX;
      const startY = e.clientY;
      dragGestureRef.current = { startX, startY, activated: false };

      // During a drag the cursor travels over iframes embedded inside other
      // windows.  Iframes swallow mouse events, which causes the document-level
      // mousemove/mouseup listeners to stop firing.  To prevent this we inject
      // a temporary <style> that sets `pointer-events: none` on all iframes
      // while the drag is active.
      let iframeBlocker: HTMLStyleElement | null = null;

      const cleanup = () => {
        dragGestureRef.current = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('keydown', handleKeyDown);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        if (iframeBlocker) {
          iframeBlocker.remove();
          iframeBlocker = null;
        }
      };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const gesture = dragGestureRef.current;
        if (!gesture) return;

        const dx = moveEvent.clientX - gesture.startX;
        const dy = moveEvent.clientY - gesture.startY;

        if (!gesture.activated && Math.sqrt(dx * dx + dy * dy) >= DRAG_DEAD_ZONE) {
          gesture.activated = true;
          useDragStore.getState().startDrag(win.id);

          // Block iframes from stealing pointer events for the duration of the drag
          iframeBlocker = document.createElement('style');
          iframeBlocker.textContent = 'iframe { pointer-events: none !important; }';
          document.head.appendChild(iframeBlocker);
        }
      };

      const handleMouseUp = () => {
        const gesture = dragGestureRef.current;
        cleanup();

        if (gesture?.activated) {
          // Finish drag — the Shell/DropZoneOverlay will handle the drop result
          const dragState = useDragStore.getState();
          const dropInfo = dragState.finishDrag();
          if (dropInfo) {
            useWindowManager
              .getState()
              .relocateWindow(
                dropInfo.sourceWindowId,
                dropInfo.target.windowId,
                dropInfo.target.edge,
              );
          }
        }
      };

      const handleKeyDown = (keyEvent: KeyboardEvent) => {
        if (keyEvent.key === 'Escape') {
          cleanup();
          useDragStore.getState().cancelDrag();
        }
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
    },
    [draggable, win.id],
  );

  const windowClasses = [
    styles.window,
    focused ? styles.windowFocused : '',
    isFullscreen && isOverlayMaximized ? styles.windowFullscreen : '',
    isDragging ? styles.windowDragging : '',
  ]
    .filter(Boolean)
    .join(' ');

  const windowStyle: React.CSSProperties = isFullscreen
    ? {}
    : tileRect
      ? {
          position: 'absolute',
          width: tileRect.width,
          height: tileRect.height,
          transform: `translate(${tileRect.x}px, ${tileRect.y}px)`,
          willChange: 'transform',
        }
      : {};

  return (
    <div
      ref={windowRef}
      className={windowClasses}
      style={windowStyle}
      data-window-id={win.id}
      onMouseDown={handleFocus}
    >
      <div
        className={styles.chrome}
        onMouseDown={handleChromeMouseDown}
        style={draggable ? { cursor: 'grab' } : undefined}
      >
        <div className={styles.trafficLights}>
          {showCloseButton && (
            <button
              className={styles.trafficLightClose}
              onClick={(e) => {
                e.stopPropagation();
                useWindowManager.getState().closeWindow(win.id);
              }}
            />
          )}

          {showFullscreenButton && (
            <button
              className={styles.trafficLightFullscreen}
              onClick={(e) => {
                e.stopPropagation();
                useWindowManager.getState().maximizeWindow(win.id);
              }}
            />
          )}
        </div>
        <div className={styles.title}>{title ?? win.title}</div>
      </div>
      <div className={styles.body}>{children}</div>
    </div>
  );
}
