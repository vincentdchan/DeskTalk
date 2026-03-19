// @desktalk/sdk - Shared types and React hooks for MiniApp development

// ─── Types ───────────────────────────────────────────────────────────────────

export type {
  MiniAppManifest,
  MiniAppBackendActivation,
  MiniAppFrontendActivation,
  MiniAppFrontendContext,
  MiniAppActivation,
} from './types/manifest';
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
} from './types/context';
export type { ActionDefinition, ActionHandler, ActionParam } from './types/actions';
export type {
  WindowState,
  PersistedWindow,
  PersistedWindowState,
  WindowPosition,
  WindowSize,
} from './types/window';
export type { LocaleMessages, LocalizeCall, I18nRuntimeValue } from './i18n/runtime';

// ─── React Hooks ─────────────────────────────────────────────────────────────

export { useCommand, useEvent, useOpenMiniApp, useWindowArgsUpdated } from './hooks/messaging';
export { ActionsProvider, Action } from './components/Actions';
export {
  $localize,
  __dtLocalize,
  I18nProvider,
  I18nScopeProvider,
  useLocalize,
  createLocalizer,
} from './i18n/runtime';

// ─── Core Shell Internals ────────────────────────────────────────────────────
// These are used by the core shell to wire up infrastructure.
// MiniApps should NOT use these directly.

export { initMessaging, MiniAppIdProvider } from './hooks/messaging';
export { WindowIdProvider, useWindowId } from './components/Actions';
