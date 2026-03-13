// @desktalk/sdk - Shared types and React hooks for MiniApp development

// ─── Types ───────────────────────────────────────────────────────────────────

export type {
  MiniAppManifest,
  MiniAppBackendActivation,
  MiniAppActivation,
} from './types/manifest.js';
export type {
  MiniAppContext,
  MiniAppPaths,
  StorageHook,
  FileSystemHook,
  FileEntry,
  FileStat,
  MessagingHook,
  Disposable,
  Logger,
} from './types/context.js';
export type { ActionDefinition, ActionHandler } from './types/actions.js';
export type { WindowState, WindowPosition, WindowSize } from './types/window.js';

// ─── React Hooks ─────────────────────────────────────────────────────────────

export { useCommand, useEvent } from './hooks/messaging.js';
export { ActionsProvider, Action } from './components/Actions.js';

// ─── Core Shell Internals ────────────────────────────────────────────────────
// These are used by the core shell to wire up infrastructure.
// MiniApps should NOT use these directly.

export { initMessaging, MiniAppIdProvider } from './hooks/messaging.js';
export { WindowIdProvider } from './components/Actions.js';
