import type { MiniAppManifest, MiniAppContext, MiniAppBackendActivation } from '@desktalk/sdk';

export const manifest: MiniAppManifest = {
  id: 'file-explorer',
  name: 'File Explorer',
  icon: '\uD83D\uDCC1',
  version: '0.1.0',
  description: 'Browse and manage files in your workspace',
};

export function activate(ctx: MiniAppContext): MiniAppBackendActivation {
  ctx.logger.info('File Explorer MiniApp activated');
  return {};
}

export function deactivate(): void {
  // cleanup
}
