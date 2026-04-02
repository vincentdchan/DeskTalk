import type { FastifyInstance } from 'fastify';

/**
 * Communication hooks provided by the core to each MiniApp at activation time.
 * Analogous to VSCode's ExtensionContext.
 */
export interface MiniAppContext {
  /** Resolved absolute paths for this MiniApp */
  paths: MiniAppPaths;
  /** Launch args for active or restored windows of this MiniApp. */
  launchArgs: Array<Record<string, unknown>>;
  /** Scoped key-value storage */
  storage: StorageHook;
  /** Filesystem access scoped to the authenticated user's home directory */
  fs: FileSystemHook;
  /** Message passing between frontend and backend */
  messaging: MessagingHook;
  /** Optional Fastify server for MiniApps that expose HTTP routes. */
  http?: MiniAppHttpServer;
  /** Register disposable resources cleaned up on deactivation */
  subscriptions: Disposable[];
  /** Logger scoped to this MiniApp */
  logger: Logger;
  /** Localizer scoped to this MiniApp */
  i18n: Localizer;
}

export interface MiniAppHttpServer {
  /** Register MiniApp-specific HTTP routes on this Fastify instance. */
  server: FastifyInstance;
}

export interface Localizer {
  t(key: string, defaultText: string, params?: Record<string, LocalizeParam>): string;
  locale(): string;
}

export type LocalizeParam = string | number | boolean | null | undefined;

/**
 * Platform-resolved paths for a MiniApp, provided by the core.
 */
export interface MiniAppPaths {
  /** Authenticated user's home directory (e.g., <data>/home/alice/) */
  home: string;
  /** Scoped data directory (e.g., <data>/home/alice/.data/note/) */
  data: string;
  /** Scoped storage file (e.g., <data>/home/alice/.storage/note.json) */
  storage: string;
  /** Scoped log file (e.g., <logs>/alice/note.log) */
  log: string;
  /** Scoped cache directory (e.g., <data>/home/alice/.cache/note/) */
  cache: string;
}

/**
 * Scoped key-value store persisted as JSON by the core.
 * Analogous to VSCode's ExtensionContext.globalState.
 */
export interface StorageHook {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  list(): Promise<string[]>;
  /** Query entries by prefix or filter */
  query<T>(options: { prefix?: string; filter?: (v: T) => boolean }): Promise<T[]>;
}

/**
 * Scoped filesystem access rooted at the authenticated user's home directory.
 * All paths resolved relative to that root.
 */
export interface FileSystemHook {
  readFile(path: string): Promise<string>;
  /** Read a file and return its contents as a base64-encoded string. */
  readFileBase64(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  /** Write a file from a base64-encoded string. */
  writeFileBase64(path: string, contentBase64: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  readDir(path: string): Promise<FileEntry[]>;
  mkdir(path: string): Promise<void>;
  stat(path: string): Promise<FileStat>;
  exists(path: string): Promise<boolean>;
}

export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
}

export interface FileStat {
  size: number;
  type: 'file' | 'directory';
  createdAt: string;
  modifiedAt: string;
}

/**
 * Backend-side messaging hook for bidirectional communication.
 * Analogous to VSCode's Webview.postMessage / onDidReceiveMessage.
 */
export interface MessagingHook {
  /** Register a handler for a named command from the frontend */
  onCommand<TReq, TRes>(command: string, handler: (data: TReq) => Promise<TRes>): Disposable;
  /** Push an event to the frontend */
  emit(event: string, data: unknown): void;
}

export interface Disposable {
  dispose(): void;
}

export interface Logger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}
