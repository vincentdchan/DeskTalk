// @desktalk/sdk - Shared types and React hooks for MiniApp development

// ─── Types ───────────────────────────────────────────────────────────────────

export type { MiniAppManifest, MiniAppActivation } from './types/manifest.js';
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
