import React, { useCallback, useRef } from 'react';
import type { WindowState } from '@desktalk/sdk';
import { useWindowManager } from '../stores/window-manager';
import styles from './WindowChrome.module.scss';

interface WindowChromeProps {
  window: WindowState;
  /** Pixel rect from tiling layout. When provided, positions the window absolutely. */
  tileRect?: { x: number; y: number; width: number; height: number };
  title?: string;
  isFocused?: boolean;
  showCloseButton?: boolean;
  showFullscreenButton?: boolean;
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
  onFocus,
  isOverlayMaximized = false,
  children,
}: WindowChromeProps) {
  const windowRef = useRef<HTMLDivElement | null>(null);
  const fullscreenWindowId = useWindowManager((s) => s.fullscreenWindowId);
  const isFullscreen = win.id === fullscreenWindowId;
  const focused = isFocused ?? win.focused;

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

  const windowClasses = [
    styles.window,
    focused ? styles.windowFocused : '',
    isFullscreen && isOverlayMaximized ? styles.windowFullscreen : '',
  ]
    .filter(Boolean)
    .join(' ');

  const windowStyle: React.CSSProperties = isFullscreen
    ? {}
    : tileRect
      ? {
          position: 'absolute',
          left: tileRect.x,
          top: tileRect.y,
          width: tileRect.width,
          height: tileRect.height,
        }
      : {};

  return (
    <div ref={windowRef} className={windowClasses} style={windowStyle} onMouseDown={handleFocus}>
      <div className={styles.chrome}>
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
