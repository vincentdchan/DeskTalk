// @desktalk/sdk - Shared types and React hooks for MiniApp development

// ─── Types ───────────────────────────────────────────────────────────────────

export type {
  MiniAppManifest,
  MiniAppBackendActivation,
  MiniAppFrontendContext,
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
  Localizer,
  LocalizeParam,
} from './types/context.js';
export type { ActionDefinition, ActionHandler, ActionParam } from './types/actions.js';
export type { WindowState, WindowPosition, WindowSize } from './types/window.js';
export type { LocaleMessages, LocalizeCall, I18nRuntimeValue } from './i18n/runtime.js';

// ─── React Hooks ─────────────────────────────────────────────────────────────

export { useCommand, useEvent } from './hooks/messaging.js';
export { ActionsProvider, Action } from './components/Actions.js';
export {
  $localize,
  __dtLocalize,
  I18nProvider,
  I18nScopeProvider,
  useLocalize,
  createLocalizer,
} from './i18n/runtime.js';

// ─── Core Shell Internals ────────────────────────────────────────────────────
// These are used by the core shell to wire up infrastructure.
// MiniApps should NOT use these directly.

export { initMessaging, MiniAppIdProvider } from './hooks/messaging.js';
export { WindowIdProvider } from './components/Actions.js';
