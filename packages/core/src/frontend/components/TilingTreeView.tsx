import type React from 'react';
import type { WindowState } from '@desktalk/sdk';
import { WindowChrome } from './WindowChrome';
import { SplitResizer } from './SplitResizer';
import { MiniAppWindow } from './MiniAppWindow';
import type { TilingNode, TreePath } from '../tiling-tree';
import type { ThemePreferences } from '../theme';
import styles from './TilingTreeView.module.scss';

const TILE_GAP = 4;

function WindowTile({
  win,
  themePreferences,
  isOverlayMaximized = false,
  draggable = false,
}: {
  win: WindowState;
  themePreferences: ThemePreferences;
  isOverlayMaximized?: boolean;
  draggable?: boolean;
}) {
  return (
    <WindowChrome window={win} isOverlayMaximized={isOverlayMaximized} draggable={draggable}>
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
  node,
  windowsById,
  themePreferences,
  path = [],
  canDrag = false,
}: {
  node: TilingNode;
  windowsById: Map<string, WindowState>;
  themePreferences: ThemePreferences;
  path?: TreePath;
  canDrag?: boolean;
}) {
  if (node.type === 'leaf') {
    const win = windowsById.get(node.windowId);
    if (!win) {
      return null;
    }

    return (
      <div className={styles.tileLeaf}>
        <WindowTile
          win={win}
          themePreferences={themePreferences}
          isOverlayMaximized={win.maximized}
          draggable={canDrag}
        />
      </div>
    );
  }

  const [first, second] = node.children;
  const containerStyle: React.CSSProperties =
    node.split === 'horizontal'
      ? {
          gridTemplateColumns: `minmax(0, ${node.ratio}fr) ${TILE_GAP}px minmax(0, ${1 - node.ratio}fr)`,
        }
      : {
          gridTemplateRows: `minmax(0, ${node.ratio}fr) ${TILE_GAP}px minmax(0, ${1 - node.ratio}fr)`,
        };

  const splitClassName = [
    styles.tileSplit,
    node.split === 'horizontal' ? styles.tileSplitHorizontal : styles.tileSplitVertical,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={splitClassName} style={containerStyle}>
      <div className={styles.tilePane}>
        <TilingTreeView
          node={first}
          windowsById={windowsById}
          themePreferences={themePreferences}
          path={[...path, 0]}
          canDrag={canDrag}
        />
      </div>
      <SplitResizer path={path} split={node.split} ratio={node.ratio} />
      <div className={styles.tilePane}>
        <TilingTreeView
          node={second}
          windowsById={windowsById}
          themePreferences={themePreferences}
          path={[...path, 1]}
          canDrag={canDrag}
        />
      </div>
    </div>
  );
}
