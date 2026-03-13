import React, { useCallback, useRef, useEffect } from 'react';
import type { WindowState } from '@desktalk/sdk';
import { useWindowManager } from '../stores/window-manager.js';
import styles from '../styles/Window.module.css';

const MIN_WINDOW_WIDTH = 300;
const MIN_WINDOW_HEIGHT = 200;

interface WindowChromeProps {
  window: WindowState;
  children: React.ReactNode;
}

export function WindowChrome({ window: win, children }: WindowChromeProps) {
  const focusWindow = useWindowManager((s) => s.focusWindow);
  const closeWindow = useWindowManager((s) => s.closeWindow);
  const minimizeWindow = useWindowManager((s) => s.minimizeWindow);
  const maximizeWindow = useWindowManager((s) => s.maximizeWindow);
  const moveWindow = useWindowManager((s) => s.moveWindow);
  const resizeWindow = useWindowManager((s) => s.resizeWindow);
  const windowRef = useRef<HTMLDivElement | null>(null);

  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(
    null,
  );
  const resizeRef = useRef<{
    startX: number;
    startY: number;
    origWidth: number;
    origHeight: number;
  } | null>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (win.maximized) return;
      e.preventDefault();
      focusWindow(win.id);
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX: win.position.x,
        origY: win.position.y,
      };

      const handleMouseMove = (me: MouseEvent) => {
        if (!dragRef.current) return;
        const dx = me.clientX - dragRef.current.startX;
        const dy = me.clientY - dragRef.current.startY;
        const parent = windowRef.current?.parentElement;

        const nextX = dragRef.current.origX + dx;
        const nextY = dragRef.current.origY + dy;

        if (!parent) {
          moveWindow(win.id, {
            x: nextX,
            y: nextY,
          });
          return;
        }

        const maxX = Math.max(parent.clientWidth - win.size.width, 0);
        const maxY = Math.max(parent.clientHeight - win.size.height, 0);

        moveWindow(win.id, {
          x: Math.min(Math.max(nextX, 0), maxX),
          y: Math.min(Math.max(nextY, 0), maxY),
        });
      };

      const handleMouseUp = () => {
        dragRef.current = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [win.id, win.maximized, win.position, focusWindow, moveWindow],
  );

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (win.maximized) return;

      e.preventDefault();
      e.stopPropagation();
      focusWindow(win.id);

      resizeRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origWidth: win.size.width,
        origHeight: win.size.height,
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

        resizeWindow(win.id, {
          width: nextWidth,
          height: nextHeight,
        });
      };

      const handleMouseUp = () => {
        resizeRef.current = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [
      focusWindow,
      resizeWindow,
      win.id,
      win.maximized,
      win.position.x,
      win.position.y,
      win.size.height,
      win.size.width,
    ],
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
        if (!win.focused) focusWindow(win.id);
      }}
    >
      <div className={styles.chrome} onMouseDown={handleMouseDown}>
        <div className={styles.trafficLights}>
          <button
            className={styles.trafficLightClose}
            onClick={(e) => {
              e.stopPropagation();
              closeWindow(win.id);
            }}
          />
          <button
            className={styles.trafficLightMinimize}
            onClick={(e) => {
              e.stopPropagation();
              minimizeWindow(win.id);
            }}
          />
          <button
            className={styles.trafficLightMaximize}
            onClick={(e) => {
              e.stopPropagation();
              maximizeWindow(win.id);
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
