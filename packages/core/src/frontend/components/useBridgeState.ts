import { useEventListener } from 'ahooks';
import type { WindowState } from '@desktalk/sdk';
import { useWindowManager } from '../stores/window-manager';

type BridgeStateSelector =
  | 'desktop.summary'
  | 'desktop.windows'
  | 'desktop.focusedWindow'
  | 'theme.current';

interface BridgeStateRequestDetail {
  selector: BridgeStateSelector;
  resolve: (value: unknown) => void;
  reject: (message: string) => void;
}

export function useBridgeState() {
  useEventListener('desktalk:bridge:get-state', (event: Event) => {
    const detail = (event as CustomEvent<BridgeStateRequestDetail>).detail;
    if (!detail?.selector) {
      return;
    }

    const store = useWindowManager.getState();
    const summarizeWindow = (windowData: WindowState) => ({
      id: windowData.id,
      miniAppId: windowData.miniAppId,
      title: windowData.title,
      focused: windowData.id === store.focusedWindowId,
      maximized: windowData.id === store.fullscreenWindowId || !!windowData.maximized,
    });

    try {
      switch (detail.selector) {
        case 'desktop.summary':
          detail.resolve({
            focusedWindowId: store.focusedWindowId,
            fullscreenWindowId: store.fullscreenWindowId,
            windows: store.windows.map(summarizeWindow),
          });
          return;
        case 'desktop.windows':
          detail.resolve(store.windows.map(summarizeWindow));
          return;
        case 'desktop.focusedWindow': {
          const focusedWindow = store.windows.find(
            (windowData) => windowData.id === store.focusedWindowId,
          );
          detail.resolve(focusedWindow ? summarizeWindow(focusedWindow) : null);
          return;
        }
        case 'theme.current': {
          const computedStyle = getComputedStyle(document.documentElement);
          const tokens = [
            '--dt-bg',
            '--dt-bg-subtle',
            '--dt-surface',
            '--dt-text',
            '--dt-text-secondary',
            '--dt-text-muted',
            '--dt-border',
            '--dt-accent',
            '--dt-danger',
            '--dt-success',
            '--dt-warning',
            '--dt-info',
          ].reduce<Record<string, string>>((acc, tokenName) => {
            acc[tokenName] = computedStyle.getPropertyValue(tokenName).trim();
            return acc;
          }, {});
          detail.resolve({
            mode: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
            tokens,
          });
          return;
        }
      }
    } catch (error) {
      detail.reject((error as Error).message);
    }
  });
}
