/**
 * Static metadata — read by the core at discovery time.
 * Analogous to the `contributes` section in a VSCode extension's package.json.
 */
export interface MiniAppFileAssociation {
  /** MIME types this MiniApp can open, e.g. ["image/png"] */
  mimeTypes?: string[];
  /** File extensions this MiniApp can open, e.g. [".md", ".txt"] */
  extensions?: string[];
}

export interface MiniAppManifest {
  /** Unique identifier, e.g. "note" */
  id: string;
  /** Display name shown in the Dock */
  name: string;
  /** Icon fallback shown in the Dock when no packaged image is available */
  icon: string;
  /** Optional packaged PNG icon served by the core as a URL */
  iconPng?: string;
  /** SemVer version */
  version: string;
  /** Optional human-readable description */
  description?: string;
  /** Optional file associations used by File Explorer and Open With flows */
  fileAssociations?: MiniAppFileAssociation;
}

/**
 * Returned from the backend activate() — reserved for future contribution
 * points. The backend no longer returns a React component.
 */
export type MiniAppBackendActivation = Record<string, never>;

/**
 * Returned from the frontend activate() so each window owns its own cleanup.
 * This keeps MiniApps safe when multiple windows of the same MiniApp are open.
 */
export interface MiniAppFrontendActivation {
  deactivate(): void;
}

/**
 * Context provided to the frontend activate() function.
 * Contains the root DOM element and metadata for the MiniApp window.
 */
export interface MiniAppFrontendContext {
  /** Root DOM element where the MiniApp should mount its UI */
  root: HTMLElement;
  /** The MiniApp's unique identifier */
  miniAppId: string;
  /** The window's unique identifier */
  windowId: string;
  /** Optional launch arguments passed when the window was opened (e.g. by the AI). */
  args?: Record<string, unknown>;
  /** Current DeskTalk theme preferences for runtime HTML injection. */
  theme?: { accentColor: string; mode: 'light' | 'dark' };
}

/**
 * @deprecated Use MiniAppBackendActivation instead. The old activate() returned
 * a React component, but the new architecture separates backend and frontend
 * into two entry files. The frontend entry exports activate()/deactivate()
 * lifecycle handlers per mounted window.
 */
export interface MiniAppActivation {
  /** Root React component rendered inside the DeskTalk window */
  component: React.ComponentType;
}
