import type { MiniAppManifest, MiniAppContext, MiniAppActivation } from '@desktalk/sdk';
import React from 'react';

export const manifest: MiniAppManifest = {
  id: 'todo',
  name: 'Todo',
  icon: '\u2705',
  version: '0.1.0',
  description: 'Task management with lists, priorities, and due dates',
};

function TodoApp() {
  return React.createElement('div', { style: { padding: 24 } },
    React.createElement('h2', null, 'Todo'),
    React.createElement('p', null, 'Todo MiniApp — coming soon.'),
  );
}

export function activate(ctx: MiniAppContext): MiniAppActivation {
  ctx.logger.info('Todo MiniApp activated');
  return { component: TodoApp };
}

export function deactivate(): void {
  // cleanup
}
