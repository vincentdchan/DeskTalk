import React, { useCallback, useRef } from 'react';
import type { WindowState } from '@desktalk/sdk';
import {
  optimisticMove,
  optimisticResize,
  requestClose,
  requestFocus,
  requestMaximize,
  requestMinimize,
  requestMove,
  requestResize,
} from '../stores/window-manager.js';
import styles from '../styles/Window.module.css';

const MIN_WINDOW_WIDTH = 300;
const MIN_WINDOW_HEIGHT = 200;

interface WindowChromeProps {
  window: WindowState;
  children: React.ReactNode;
}

export function WindowChrome({ window: win, children }: WindowChromeProps) {
  const windowRef = useRef<HTMLDivElement | null>(null);

  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    lastX: number;
    lastY: number;
  } | null>(null);
  const resizeRef = useRef<{
    startX: number;
    startY: number;
    origWidth: number;
    origHeight: number;
    lastWidth: number;
    lastHeight: number;
  } | null>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (win.maximized) return;
      e.preventDefault();
      requestFocus(win.id);
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX: win.position.x,
        origY: win.position.y,
        lastX: win.position.x,
        lastY: win.position.y,
      };

      const handleMouseMove = (me: MouseEvent) => {
        if (!dragRef.current) return;
        const dx = me.clientX - dragRef.current.startX;
        const dy = me.clientY - dragRef.current.startY;
        const parent = windowRef.current?.parentElement;

        const nextX = dragRef.current.origX + dx;
        const nextY = dragRef.current.origY + dy;

        if (!parent) {
          const nextPosition = {
            x: nextX,
            y: nextY,
          };
          dragRef.current.lastX = nextPosition.x;
          dragRef.current.lastY = nextPosition.y;
          optimisticMove(win.id, nextPosition);
          return;
        }

        const maxX = Math.max(parent.clientWidth - win.size.width, 0);
        const maxY = Math.max(parent.clientHeight - win.size.height, 0);

        const nextPosition = {
          x: Math.min(Math.max(nextX, 0), maxX),
          y: Math.min(Math.max(nextY, 0), maxY),
        };
        dragRef.current.lastX = nextPosition.x;
        dragRef.current.lastY = nextPosition.y;
        optimisticMove(win.id, nextPosition);
      };

      const handleMouseUp = () => {
        if (dragRef.current) {
          requestMove(win.id, {
            x: dragRef.current.lastX,
            y: dragRef.current.lastY,
          });
        }
        dragRef.current = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [win.id, win.maximized, win.position],
  );

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (win.maximized) return;

      e.preventDefault();
      e.stopPropagation();
      requestFocus(win.id);

      resizeRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origWidth: win.size.width,
        origHeight: win.size.height,
        lastWidth: win.size.width,
        lastHeight: win.size.height,
      };

      const handleMouseMove = (me: MouseEvent) => {
        if (!resizeRef.current) return;

        const dx = me.clientX - resizeRef.current.startX;
        const dy = me.clientY - resizeRef.current.startY;
        const parent = windowRef.current?.parentElement;

        let nextWidth = Math.max(resizeRef.current.origWidth + dx, MIN_WINDOW_WIDTH);
        let nextHeight = Math.max(resizeRef.current.origHeight + dy, MIN_WINDOW_HEIGHT);

        if (parent) {
          const maxWidth = Math.max(parent.clientWidth - win.position.x, MIN_WINDOW_WIDTH);
          const maxHeight = Math.max(parent.clientHeight - win.position.y, MIN_WINDOW_HEIGHT);
          nextWidth = Math.min(nextWidth, maxWidth);
          nextHeight = Math.min(nextHeight, maxHeight);
        }

        const nextSize = {
          width: nextWidth,
          height: nextHeight,
        };
        resizeRef.current.lastWidth = nextSize.width;
        resizeRef.current.lastHeight = nextSize.height;
        optimisticResize(win.id, nextSize);
      };

      const handleMouseUp = () => {
        if (resizeRef.current) {
          requestResize(win.id, {
            width: resizeRef.current.lastWidth,
            height: resizeRef.current.lastHeight,
          });
        }
        resizeRef.current = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [win.id, win.maximized, win.position.x, win.position.y, win.size.height, win.size.width],
  );

  if (win.minimized) return null;

  const windowClasses = [
    styles.window,
    win.focused ? styles.windowFocused : '',
    win.maximized ? styles.windowMaximized : '',
  ]
    .filter(Boolean)
    .join(' ');

  const windowStyle: React.CSSProperties = win.maximized
    ? {}
    : {
        left: win.position.x,
        top: win.position.y,
        width: win.size.width,
        height: win.size.height,
        zIndex: win.zIndex,
      };

  return (
    <div
      ref={windowRef}
      className={windowClasses}
      style={windowStyle}
      onMouseDown={() => {
        if (!win.focused) requestFocus(win.id);
      }}
    >
      <div className={styles.chrome} onMouseDown={handleMouseDown}>
        <div className={styles.trafficLights}>
          <button
            className={styles.trafficLightClose}
            onClick={(e) => {
              e.stopPropagation();
              requestClose(win.id);
            }}
          />
          <button
            className={styles.trafficLightMinimize}
            onClick={(e) => {
              e.stopPropagation();
              requestMinimize(win.id);
            }}
          />
          <button
            className={styles.trafficLightMaximize}
            onClick={(e) => {
              e.stopPropagation();
              requestMaximize(win.id);
            }}
          />
        </div>
        <div className={styles.title}>{win.title}</div>
      </div>
      <div className={styles.body}>{children}</div>
      {!win.maximized && (
        <div className={styles.resizeHandle} onMouseDown={handleResizeMouseDown} />
      )}
    </div>
  );
}
