import React, { useCallback, useRef, useEffect } from 'react';
import type { WindowState } from '@desktalk/sdk';
import { useWindowManager } from '../stores/window-manager.js';
import styles from '../styles/Window.module.css';

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

  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(
    null,
  );

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
        moveWindow(win.id, {
          x: dragRef.current.origX + dx,
          y: dragRef.current.origY + dy,
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
    </div>
  );
}
