import type { MiniAppManifest, MiniAppContext, MiniAppActivation } from '@desktalk/sdk';
import React from 'react';

export const manifest: MiniAppManifest = {
  id: 'note',
  name: 'Note',
  icon: '\uD83D\uDDD2\uFE0F',
  version: '0.1.0',
  description: 'Markdown note-taking with tags and YAML front matter',
};

function NoteApp() {
  return React.createElement('div', { style: { padding: 24 } },
    React.createElement('h2', null, 'Note'),
    React.createElement('p', null, 'Note MiniApp — coming soon.'),
  );
}

export function activate(ctx: MiniAppContext): MiniAppActivation {
  ctx.logger.info('Note MiniApp activated');
  return { component: NoteApp };
}

export function deactivate(): void {
  // cleanup
}
