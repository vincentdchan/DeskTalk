import type { MiniAppManifest } from '@desktalk/sdk';
import { create } from 'zustand';
import { httpClient } from '../http-client';
import type { LiveAppRecord } from '../components/launcher-types';
import { useWindowManager } from './window-manager';

interface AppStoreState {
  manifests: MiniAppManifest[];
  liveApps: LiveAppRecord[];
}

interface AppStoreActions {
  loadManifests: () => Promise<void>;
  loadLiveApps: () => Promise<void>;
  removeLiveApp: (liveAppId: string) => Promise<void>;
}

export const useAppStore = create<AppStoreState & AppStoreActions>((set) => ({
  manifests: [],
  liveApps: [],

  async loadManifests() {
    try {
      const response = await httpClient.get<MiniAppManifest[]>('/api/miniapps');
      set({ manifests: response.data });
    } catch (error) {
      console.error('[app-store] Could not load MiniApps:', error);
    }
  },

  async loadLiveApps() {
    try {
      const response = await httpClient.get<LiveAppRecord[]>('/api/liveapps');
      set({ liveApps: response.data });
    } catch (error) {
      console.error('[app-store] Could not load LiveApps:', error);
    }
  },

  async removeLiveApp(liveAppId: string) {
    const windowManager = useWindowManager.getState();
    const liveAppWindows = windowManager.windows.filter(
      (window) => window.miniAppId === 'preview' && window.args?.liveAppId === liveAppId,
    );

    for (const window of liveAppWindows) {
      useWindowManager.getState().closeWindow(window.id);
    }

    await httpClient.delete(`/api/liveapps/${encodeURIComponent(liveAppId)}`);

    set((state) => ({
      liveApps: state.liveApps.filter((app) => app.id !== liveAppId),
    }));
  },
}));
