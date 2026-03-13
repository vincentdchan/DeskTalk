import type { MiniAppManifest, MiniAppContext, MiniAppBackendActivation } from '@desktalk/sdk';

export const manifest: MiniAppManifest = {
  id: 'todo',
  name: 'Todo',
  icon: '\u2705',
  version: '0.1.0',
  description: 'Task management with lists, priorities, and due dates',
};

export function activate(ctx: MiniAppContext): MiniAppBackendActivation {
  ctx.logger.info('Todo MiniApp activated');
  return {};
}

export function deactivate(): void {
  // cleanup
}
