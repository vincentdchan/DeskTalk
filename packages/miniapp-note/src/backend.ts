import type { MiniAppManifest, MiniAppContext, MiniAppBackendActivation } from '@desktalk/sdk';

export const manifest: MiniAppManifest = {
  id: 'note',
  name: 'Note',
  icon: '\uD83D\uDDD2\uFE0F',
  version: '0.1.0',
  description: 'Markdown note-taking with tags and YAML front matter',
};

export function activate(ctx: MiniAppContext): MiniAppBackendActivation {
  ctx.logger.info('Note MiniApp activated');
  return {};
}

export function deactivate(): void {
  // cleanup
}
