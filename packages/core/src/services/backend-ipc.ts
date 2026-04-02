import type { MiniAppPaths } from '@desktalk/sdk';
import type { LoggerConfig } from './logger';

export interface LaunchWindowArgs {
  [key: string]: unknown;
}

// ─── Main → Child Messages ──────────────────────────────────────────────────

/** Tell the child process to import and activate a MiniApp backend. */
export interface ActivateMessage {
  type: 'activate';
  miniAppId: string;
  /** Resolved file-URL or bare specifier the child can `import()`. */
  backendPath: string;
  /** Absolute path to the MiniApp package root (for i18n). */
  packageRoot: string;
  /** Pre-resolved MiniApp paths (data, storage, log, cache). */
  paths: MiniAppPaths;
  /** Launch args for the active or restored windows of this MiniApp. */
  launchArgs: LaunchWindowArgs[];
  /** Whether the MiniApp should start an internal HTTP server. */
  httpRoutes?: boolean;
  /** Locale string (e.g. "en", "zh-CN"). */
  locale: string;
  /** Logger configuration so the child can recreate an equivalent pino instance. */
  loggerConfig: LoggerConfig;
}

/** Forward a command:invoke from the renderer to the child. */
export interface CommandInvokeMessage {
  type: 'command:invoke';
  requestId: string;
  command: string;
  data: unknown;
}

/** Tell the child process to deactivate and exit. */
export interface DeactivateMessage {
  type: 'deactivate';
}

export type MainToChildMessage = ActivateMessage | CommandInvokeMessage | DeactivateMessage;

// ─── Child → Main Messages ──────────────────────────────────────────────────

/** The child has finished activation and is ready to accept commands. */
export interface ReadyMessage {
  type: 'ready';
  miniAppId: string;
}

/** Result (or error) for a previously forwarded command. */
export interface CommandResponseMessage {
  type: 'command:response';
  requestId: string;
  data?: unknown;
  error?: string;
}

/** The MiniApp child process started its internal HTTP server. */
export interface HttpReadyMessage {
  type: 'http:ready';
  miniAppId: string;
  socketPath: string;
}

/** The MiniApp backend emitted an event that should be broadcast to renderers. */
export interface EventBroadcastMessage {
  type: 'event';
  miniAppId: string;
  event: string;
  data: unknown;
}

/** Unrecoverable error in the child process. */
export interface ChildErrorMessage {
  type: 'error';
  message: string;
}

export type ChildToMainMessage =
  | ReadyMessage
  | CommandResponseMessage
  | HttpReadyMessage
  | EventBroadcastMessage
  | ChildErrorMessage;
