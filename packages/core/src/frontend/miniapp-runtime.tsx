import React from 'react';

/**
 * Frontend MiniApp module — what a MiniApp's frontend entry exports.
 */
interface MiniAppFrontendModule {
  default: React.ComponentType;
}

const builtinLoaders: Record<string, () => Promise<MiniAppFrontendModule>> = {
  note: () => import('@desktalk/miniapp-note/frontend') as Promise<MiniAppFrontendModule>,
  todo: () => import('@desktalk/miniapp-todo/frontend') as Promise<MiniAppFrontendModule>,
  'file-explorer': () =>
    import('@desktalk/miniapp-file-explorer/frontend') as Promise<MiniAppFrontendModule>,
  preference: () =>
    import('@desktalk/miniapp-preference/frontend') as Promise<MiniAppFrontendModule>,
};

const componentCache = new Map<string, React.ComponentType>();

/**
 * Load a MiniApp's root React component from its frontend entry.
 * The frontend entry exports the component as its default export —
 * no activation context or stub APIs needed.
 */
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
  componentCache.set(miniAppId, mod.default);
  return mod.default;
}
