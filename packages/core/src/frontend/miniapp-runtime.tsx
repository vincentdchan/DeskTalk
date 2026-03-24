import type { MiniAppFrontendActivation, MiniAppFrontendContext } from '@desktalk/sdk';

/**
 * Frontend MiniApp module — what a MiniApp's frontend entry exports.
 * MiniApps export activate/deactivate hooks (like the backend) rather than
 * a React component. The MiniApp itself mounts its UI to the provided root element.
 */
export interface MiniAppFrontendModule {
  activate(ctx: MiniAppFrontendContext): MiniAppFrontendActivation;
}

const builtinLoaders: Record<string, () => Promise<MiniAppFrontendModule>> = {
  'file-explorer': () =>
    import('@desktalk/miniapp-file-explorer/frontend') as Promise<MiniAppFrontendModule>,
  preference: () =>
    import('@desktalk/miniapp-preference/frontend') as Promise<MiniAppFrontendModule>,
  preview: () => import('@desktalk/miniapp-preview/frontend') as Promise<MiniAppFrontendModule>,
  terminal: () => import('@desktalk/miniapp-terminal/frontend') as Promise<MiniAppFrontendModule>,
  'text-edit': () =>
    import('@desktalk/miniapp-text-edit/frontend') as Promise<MiniAppFrontendModule>,
};

const moduleCache = new Map<string, MiniAppFrontendModule>();

/**
 * Load a MiniApp's frontend module.
 * The frontend entry exports activate() and returns a per-window cleanup handle.
 */
export async function loadMiniAppModule(miniAppId: string): Promise<MiniAppFrontendModule> {
  const cached = moduleCache.get(miniAppId);
  if (cached) {
    return cached;
  }

  const load = builtinLoaders[miniAppId];
  if (!load) {
    throw new Error(`No frontend bundle found for miniapp: ${miniAppId}`);
  }

  const mod = await load();
  moduleCache.set(miniAppId, mod);
  return mod;
}
