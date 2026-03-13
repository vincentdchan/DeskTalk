import type { MiniAppManifest, MiniAppContext, MiniAppBackendActivation } from '@desktalk/sdk';

export const manifest: MiniAppManifest = {
  id: 'preference',
  name: 'Preferences',
  icon: '\u2699\uFE0F',
  version: '0.1.0',
  description: 'Application settings and configuration',
};

export function activate(ctx: MiniAppContext): MiniAppBackendActivation {
  ctx.logger.info('Preference MiniApp activated');
  return {};
}

export function deactivate(): void {
  // cleanup
}
