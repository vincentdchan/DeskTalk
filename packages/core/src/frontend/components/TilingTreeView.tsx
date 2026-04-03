import type { WindowState } from '@desktalk/sdk';
import { MiniAppWindow } from './MiniAppWindow';
import { SplitResizer } from './SplitResizer';
import { WindowChrome } from './WindowChrome';
import { useWindowManager } from '../stores/window-manager';
import type { ThemePreferences } from '../theme';

function WindowTile({
  win,
  tileRect,
  themePreferences,
  isOverlayMaximized = false,
  draggable = false,
}: {
  win: WindowState;
  tileRect: { x: number; y: number; width: number; height: number };
  themePreferences: ThemePreferences;
  isOverlayMaximized?: boolean;
  draggable?: boolean;
}) {
  return (
    <WindowChrome
      window={win}
      tileRect={tileRect}
      isOverlayMaximized={isOverlayMaximized}
      draggable={draggable}
    >
      <MiniAppWindow
        miniAppId={win.miniAppId}
        windowId={win.id}
        args={win.args}
        themePreferences={themePreferences}
      />
    </WindowChrome>
  );
}

export function TilingTreeView({
  windowsById,
  themePreferences,
  canDrag = false,
}: {
  windowsById: Map<string, WindowState>;
  themePreferences: ThemePreferences;
  canDrag?: boolean;
}) {
  const tileRects = useWindowManager((state) => state.tileRects);
  const splitBars = useWindowManager((state) => state.splitBars);

  return (
    <>
      {tileRects.map((tileRect) => {
        const win = windowsById.get(tileRect.windowId);
        if (!win) {
          return null;
        }

        return (
          <WindowTile
            key={win.id}
            win={win}
            tileRect={tileRect}
            themePreferences={themePreferences}
            isOverlayMaximized={win.maximized}
            draggable={canDrag}
          />
        );
      })}
      {splitBars.map((bar) => {
        const barKey = bar.path.length > 0 ? bar.path.join('-') : 'root';

        return (
          <SplitResizer
            key={barKey}
            path={bar.path}
            split={bar.split}
            ratio={bar.ratio}
            rect={{ x: bar.x, y: bar.y, width: bar.width, height: bar.height }}
            containerSize={{ width: bar.containerWidth, height: bar.containerHeight }}
          />
        );
      })}
    </>
  );
}
