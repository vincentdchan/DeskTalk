/**
 * Communication hooks provided by the core to each MiniApp at activation time.
 * Analogous to VSCode's ExtensionContext.
 */
export interface MiniAppContext {
  /** Resolved absolute paths for this MiniApp */
  paths: MiniAppPaths;
  /** Scoped key-value storage */
  storage: StorageHook;
  /** Filesystem access scoped to this MiniApp's data directory */
  fs: FileSystemHook;
  /** Message passing between frontend and backend */
  messaging: MessagingHook;
  /** Register disposable resources cleaned up on deactivation */
  subscriptions: Disposable[];
  /** Logger scoped to this MiniApp */
  logger: Logger;
}

/**
 * Platform-resolved paths for a MiniApp, provided by the core.
 */
export interface MiniAppPaths {
  /** Scoped data directory (e.g., <data>/data/note/) */
  data: string;
  /** Scoped storage file (e.g., <data>/storage/note.json) */
  storage: string;
  /** Scoped log file (e.g., <logs>/note.log) */
  log: string;
  /** Scoped cache directory (e.g., <cache>/note/) */
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
 * Scoped filesystem access rooted at ctx.paths.data.
 * All paths resolved relative to that root.
 */
export interface FileSystemHook {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
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
  onCommand<TReq, TRes>(
    command: string,
    handler: (data: TReq) => Promise<TRes>,
  ): Disposable;
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
