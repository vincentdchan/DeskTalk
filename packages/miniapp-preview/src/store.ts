import { createStore } from 'zustand/vanilla';
import type { PreviewMode } from './types';

interface PreviewStoreState {
  mode: PreviewMode;
  streaming: boolean;
  resolvedHtmlPath: string | null;
  resolvedLiveAppId: string | null;
}

interface PreviewStoreActions {
  setStreaming: (streaming: boolean) => void;
  switchToHtmlMode: (path: string, liveAppId?: string | null) => void;
}

export type PreviewStore = PreviewStoreState & PreviewStoreActions;

export function createPreviewStore(
  initialMode: PreviewMode,
  initialPath: string | null = null,
  liveAppId: string | null = null,
) {
  return createStore<PreviewStore>((set) => ({
    mode: initialMode,
    streaming: initialMode === 'stream',
    resolvedHtmlPath: initialMode === 'html' ? initialPath : null,
    resolvedLiveAppId: initialMode === 'html' ? liveAppId : null,
    setStreaming(streaming: boolean) {
      set({ streaming });
    },
    switchToHtmlMode(path: string, liveAppId?: string | null) {
      set({
        mode: 'html',
        streaming: false,
        resolvedHtmlPath: path,
        resolvedLiveAppId: liveAppId ?? null,
      });
    },
  }));
}
