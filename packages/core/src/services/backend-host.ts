/**
 * Child-process entry point for an isolated MiniApp backend.
 *
 * Spawned by BackendProcessManager via `child_process.fork()`.
 * Receives an "activate" message over IPC, imports the backend module,
 * wires up a local MessagingHook that bridges commands/events through IPC,
 * then signals "ready" back to the main process.
 */

import type { MiniAppContext, MessagingHook, Disposable } from '@desktalk/sdk';
import { dirname } from 'node:path';
import type { MainToChildMessage, ChildToMainMessage, ActivateMessage } from './backend-ipc';
import { createStorageHook } from './storage';
import { createFileSystemHook } from './filesystem';
import { createChildLogger } from './logger';
import { createPackageLocalizer } from './i18n';

// ─── Per-process state ──────────────────────────────────────────────────────

const commandHandlers = new Map<string, (data: unknown) => Promise<unknown>>();
let deactivateFn: (() => void) | null = null;
let subscriptions: Disposable[] = [];

// ─── Helpers ────────────────────────────────────────────────────────────────

function sendToMain(msg: ChildToMainMessage): void {
  if (process.send) {
    process.send(msg);
  }
}

/**
 * Creates a MessagingHook that lives entirely inside this child process.
 * - onCommand: registers a handler in the local map.
 * - emit: forwards the event to the main process via IPC.
 */
function createChildMessagingHook(miniAppId: string): MessagingHook {
  return {
    onCommand<TReq, TRes>(command: string, handler: (data: TReq) => Promise<TRes>): Disposable {
      commandHandlers.set(command, handler as (data: unknown) => Promise<unknown>);
      return {
        dispose() {
          commandHandlers.delete(command);
        },
      };
    },

    emit(event: string, data: unknown): void {
      sendToMain({ type: 'event', miniAppId, event, data });
    },
  };
}

function resolveUserHomeDir(miniAppDataDir: string): string {
  return dirname(dirname(miniAppDataDir));
}

// ─── Message handlers ───────────────────────────────────────────────────────

async function handleActivate(msg: ActivateMessage): Promise<void> {
  const mod = await import(msg.backendPath);

  const context: MiniAppContext = {
    paths: msg.paths,
    launchArgs: Array.isArray(msg.launchArgs) ? msg.launchArgs : [],
    storage: createStorageHook(msg.paths.storage),
    fs: createFileSystemHook(resolveUserHomeDir(msg.paths.data)),
    messaging: createChildMessagingHook(msg.miniAppId),
    subscriptions: [],
    logger: createChildLogger(msg.loggerConfig, msg.miniAppId),
    i18n: createPackageLocalizer({
      packageRoot: msg.packageRoot,
      defaultScope: msg.miniAppId,
      locale: msg.locale,
    }),
  };

  subscriptions = context.subscriptions;
  deactivateFn = () => mod.deactivate();
  mod.activate(context);

  sendToMain({ type: 'ready', miniAppId: msg.miniAppId });
}

async function handleCommandInvoke(
  requestId: string,
  command: string,
  data: unknown,
): Promise<void> {
  const handler = commandHandlers.get(command);
  if (!handler) {
    sendToMain({
      type: 'command:response',
      requestId,
      error: `No handler registered for command: ${command}`,
    });
    return;
  }

  try {
    const result = await handler(data);
    sendToMain({ type: 'command:response', requestId, data: result });
  } catch (err) {
    sendToMain({
      type: 'command:response',
      requestId,
      error: (err as Error).message,
    });
  }
}

function handleDeactivate(): void {
  for (const sub of subscriptions) {
    sub.dispose();
  }
  deactivateFn?.();
  process.exit(0);
}

// ─── IPC listener ───────────────────────────────────────────────────────────

process.on('message', async (msg: MainToChildMessage) => {
  try {
    switch (msg.type) {
      case 'activate':
        await handleActivate(msg);
        break;
      case 'command:invoke':
        await handleCommandInvoke(msg.requestId, msg.command, msg.data);
        break;
      case 'deactivate':
        handleDeactivate();
        break;
    }
  } catch (err) {
    sendToMain({ type: 'error', message: (err as Error).message });
  }
});
