/**
 * Child-process entry point for an isolated MiniApp backend.
 *
 * Spawned by BackendProcessManager via `child_process.fork()`.
 * Receives an "activate" message over IPC, imports the backend module,
 * wires up a local MessagingHook that bridges commands/events through IPC,
 * then signals "ready" back to the main process.
 */

import type {
  MiniAppContext,
  MessagingHook,
  Disposable,
  SettingsHook,
  SettingsSchemaDocument,
} from '@desktalk/sdk';
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

/** Registered settings onChange listeners for this process. */
const settingsChangeListeners: Array<
  (change: { key: string; value: string | number | boolean }) => void
> = [];

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

/**
 * Creates a scoped, read-only SettingsHook for the MiniApp.
 * Falls back to schema defaults for unset keys.
 */
function createSettingsHook(
  schema: SettingsSchemaDocument,
  initialValues: Record<string, string | number | boolean>,
): SettingsHook {
  // Mutable copy — updated when settings:changed messages arrive
  const currentValues = { ...initialValues };

  return {
    async get<T extends string | number | boolean>(key: string): Promise<T> {
      if (key in currentValues) {
        return currentValues[key] as T;
      }
      const def = schema.settings[key];
      if (def) {
        return def.default as T;
      }
      return undefined as unknown as T;
    },

    async getAll(): Promise<Record<string, string | number | boolean>> {
      const result: Record<string, string | number | boolean> = {};
      // Start with schema defaults
      for (const [key, def] of Object.entries(schema.settings) as Array<
        [string, { default: string | number | boolean }]
      >) {
        result[key] = def.default;
      }
      // Override with stored values
      Object.assign(result, currentValues);
      return result;
    },

    onChange(
      handler: (change: { key: string; value: string | number | boolean }) => void,
    ): Disposable {
      settingsChangeListeners.push(handler);
      return {
        dispose() {
          const idx = settingsChangeListeners.indexOf(handler);
          if (idx >= 0) {
            settingsChangeListeners.splice(idx, 1);
          }
        },
      };
    },
  };
}

/**
 * Handle a settings:changed message from the main process.
 * Updates the local cache and notifies listeners.
 */
function handleSettingsChanged(key: string, value: string | number | boolean): void {
  // Update is handled via closure in the SettingsHook — we need a reference
  // to the currentValues object. We solve this by keeping a module-level ref.
  if (settingsCurrentValues) {
    settingsCurrentValues[key] = value;
  }
  for (const listener of settingsChangeListeners) {
    try {
      listener({ key, value });
    } catch {
      // Swallow listener errors
    }
  }
}

/** Module-level reference to the current settings values for mutation. */
let settingsCurrentValues: Record<string, string | number | boolean> | null = null;

// ─── Message handlers ───────────────────────────────────────────────────────

async function handleActivate(msg: ActivateMessage): Promise<void> {
  const mod = await import(msg.backendPath);

  // Create the settings hook if this MiniApp declares a schema
  let settingsHook: SettingsHook | undefined;
  if (msg.settingsSchema) {
    const initialValues = msg.settingsValues ?? {};
    settingsCurrentValues = initialValues;
    settingsHook = createSettingsHook(msg.settingsSchema, initialValues);
  }

  const context: MiniAppContext = {
    paths: msg.paths,
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
    settings: settingsHook,
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
      case 'settings:changed':
        handleSettingsChanged(msg.key, msg.value);
        break;
    }
  } catch (err) {
    sendToMain({ type: 'error', message: (err as Error).message });
  }
});
