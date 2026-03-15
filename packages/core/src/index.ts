// @desktalk/core — Main application shell
// Re-export services for programmatic use

export { initWorkspace, getWorkspacePaths, resolveMiniAppPaths } from './services/workspace';
export { registry, registerBuiltinMiniApps } from './services/miniapp-registry';
export type { MiniAppBackendModule, MiniAppEntry } from './services/miniapp-registry';
export { createServer } from './server/index';
export type { ServerOptions } from './server/index';
