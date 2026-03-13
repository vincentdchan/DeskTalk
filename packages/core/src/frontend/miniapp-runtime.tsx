import React from 'react';
import type { MiniAppActivation, MiniAppContext, MiniAppManifest } from '@desktalk/sdk';

interface MiniAppModule {
  manifest: MiniAppManifest;
  activate(ctx: MiniAppContext): MiniAppActivation;
  deactivate?(): void;
}

const builtinLoaders: Record<string, () => Promise<MiniAppModule>> = {
  note: () => import('@desktalk/miniapp-note') as Promise<MiniAppModule>,
  todo: () => import('@desktalk/miniapp-todo') as Promise<MiniAppModule>,
  'file-explorer': () => import('@desktalk/miniapp-file-explorer') as Promise<MiniAppModule>,
  preference: () => import('@desktalk/miniapp-preference') as Promise<MiniAppModule>,
};

const componentCache = new Map<string, React.ComponentType>();

function createUnsupportedApi(name: string, miniAppId: string) {
  return async () => {
    throw new Error(
      `${name} is not available in the browser activation context for miniapp \"${miniAppId}\"`,
    );
  };
}

function createBrowserContext(miniAppId: string): MiniAppContext {
  const noop = () => {};
  return {
    paths: {
      data: '',
      storage: '',
      log: '',
      cache: '',
    },
    storage: {
      get: createUnsupportedApi('storage.get', miniAppId),
      set: createUnsupportedApi('storage.set', miniAppId),
      delete: createUnsupportedApi('storage.delete', miniAppId),
      list: createUnsupportedApi('storage.list', miniAppId),
      query: createUnsupportedApi('storage.query', miniAppId),
    },
    fs: {
      readFile: createUnsupportedApi('fs.readFile', miniAppId),
      writeFile: createUnsupportedApi('fs.writeFile', miniAppId),
      deleteFile: createUnsupportedApi('fs.deleteFile', miniAppId),
      readDir: createUnsupportedApi('fs.readDir', miniAppId),
      mkdir: createUnsupportedApi('fs.mkdir', miniAppId),
      stat: createUnsupportedApi('fs.stat', miniAppId),
      exists: createUnsupportedApi('fs.exists', miniAppId),
    },
    messaging: {
      onCommand() {
        return { dispose: noop };
      },
      emit: noop,
    },
    subscriptions: [],
    logger: {
      info: noop,
      warn: noop,
      error: noop,
      debug: noop,
    },
  };
}

export async function loadMiniAppComponent(miniAppId: string): Promise<React.ComponentType> {
  const cached = componentCache.get(miniAppId);
  if (cached) {
    return cached;
  }

  const load = builtinLoaders[miniAppId];
  if (!load) {
    throw new Error(`No frontend bundle found for miniapp: ${miniAppId}`);
  }

  const mod = await load();
  const activation = mod.activate(createBrowserContext(miniAppId));
  componentCache.set(miniAppId, activation.component);
  return activation.component;
}
