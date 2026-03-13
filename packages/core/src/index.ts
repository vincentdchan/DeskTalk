// @desktalk/core — Main application shell
// Re-export services for programmatic use

export { initWorkspace, getWorkspacePaths, resolveMiniAppPaths } from './services/workspace.js';
export { registry, registerBuiltinMiniApps } from './services/miniapp-registry.js';
export type { MiniAppModule, MiniAppEntry } from './services/miniapp-registry.js';
export { createServer } from './server/index.js';
export type { ServerOptions } from './server/index.js';
