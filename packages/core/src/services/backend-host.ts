/**
 * Child-process entry point for an isolated MiniApp backend.
 *
 * Spawned by BackendProcessManager via `child_process.fork()`.
 * Receives an "activate" message over IPC, imports the backend module,
 * wires up a local MessagingHook that bridges commands/events through IPC,
 * then signals "ready" back to the main process.
 */

import type { MiniAppContext, MessagingHook, Disposable } from '@desktalk/sdk';
import type { FastifyInstance } from 'fastify';
import { unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import type { MainToChildMessage, ChildToMainMessage, ActivateMessage } from './backend-ipc';
import { createStorageHook } from './storage';
import { createFileSystemHook } from './filesystem';
import { createChildLogger } from './logger';
import { createPackageLocalizer } from './i18n';

// ─── Per-process state ──────────────────────────────────────────────────────

const commandHandlers = new Map<string, (data: unknown) => Promise<unknown>>();
let deactivateFn: (() => void) | null = null;
let subscriptions: Disposable[] = [];
let httpServer: FastifyInstance | null = null;
let httpSocketPath: string | null = null;

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

function getHttpSocketPath(miniAppId: string, username: string): string {
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\desktalk-${miniAppId}-${username}-${process.pid}`;
  }

  return join(tmpdir(), `desktalk-${miniAppId}-${username}-${process.pid}.sock`);
}

function cleanupHttpSocket(socketPath: string | null): void {
  if (!socketPath || process.platform === 'win32') {
    return;
  }

  try {
    unlinkSync(socketPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

// ─── Message handlers ───────────────────────────────────────────────────────

async function handleActivate(msg: ActivateMessage): Promise<void> {
  const mod = await import(msg.backendPath);
  const username = basename(msg.paths.home);

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

  if (msg.httpRoutes) {
    httpSocketPath = getHttpSocketPath(msg.miniAppId, username);
    cleanupHttpSocket(httpSocketPath);
    const { default: createFastify } = await import('fastify');
    httpServer = createFastify({ logger: false });
    context.http = { server: httpServer };
  }

  subscriptions = context.subscriptions;
  deactivateFn = () => mod.deactivate();
  mod.activate(context);

  if (httpServer && httpSocketPath) {
    await httpServer.listen({ path: httpSocketPath });
    sendToMain({ type: 'http:ready', miniAppId: msg.miniAppId, socketPath: httpSocketPath });
  }

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

async function handleDeactivate(): Promise<void> {
  for (const sub of subscriptions) {
    sub.dispose();
  }
  deactivateFn?.();

  if (httpServer) {
    const server = httpServer;
    httpServer = null;
    await server.close();
  }
  cleanupHttpSocket(httpSocketPath);
  httpSocketPath = null;

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
        await handleDeactivate();
        break;
    }
  } catch (err) {
    sendToMain({ type: 'error', message: (err as Error).message });
  }
});
