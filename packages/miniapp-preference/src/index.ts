import type { MiniAppManifest, MiniAppContext, MiniAppActivation } from '@desktalk/sdk';
import React from 'react';

export const manifest: MiniAppManifest = {
  id: 'preference',
  name: 'Preferences',
  icon: '\u2699\uFE0F',
  version: '0.1.0',
  description: 'Application settings and configuration',
};

function PreferenceApp() {
  return React.createElement('div', { style: { padding: 24 } },
    React.createElement('h2', null, 'Preferences'),
    React.createElement('p', null, 'Preference MiniApp — coming soon.'),
  );
}

export function activate(ctx: MiniAppContext): MiniAppActivation {
  ctx.logger.info('Preference MiniApp activated');
  return { component: PreferenceApp };
}

export function deactivate(): void {
  // cleanup
}
