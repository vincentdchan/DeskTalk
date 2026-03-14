import React from 'react';
import { createRoot } from 'react-dom/client';
import type { MiniAppFrontendContext } from '@desktalk/sdk';
import { MiniAppIdProvider, WindowIdProvider } from '@desktalk/sdk';

function TodoApp() {
  return (
    <div style={{ padding: 24 }}>
      <h2>Todo</h2>
      <p>Todo MiniApp — coming soon.</p>
    </div>
  );
}

let root: ReturnType<typeof createRoot> | null = null;

export function activate(ctx: MiniAppFrontendContext): void {
  root = createRoot(ctx.root);
  root.render(
    <WindowIdProvider windowId={ctx.windowId}>
      <MiniAppIdProvider miniAppId={ctx.miniAppId}>
        <TodoApp />
      </MiniAppIdProvider>
    </WindowIdProvider>,
  );
}

export function deactivate(): void {
  root?.unmount();
  root = null;
}
