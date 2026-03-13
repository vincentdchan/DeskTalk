import type { MiniAppManifest, MiniAppContext, MiniAppActivation } from '@desktalk/sdk';
import React from 'react';

export const manifest: MiniAppManifest = {
  id: 'file-explorer',
  name: 'File Explorer',
  icon: '\uD83D\uDCC1',
  version: '0.1.0',
  description: 'Browse and manage files in your workspace',
};

function FileExplorerApp() {
  return React.createElement('div', { style: { padding: 24 } },
    React.createElement('h2', null, 'File Explorer'),
    React.createElement('p', null, 'File Explorer MiniApp — coming soon.'),
  );
}

export function activate(ctx: MiniAppContext): MiniAppActivation {
  ctx.logger.info('File Explorer MiniApp activated');
  return { component: FileExplorerApp };
}

export function deactivate(): void {
  // cleanup
}
