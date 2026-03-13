/**
 * Static metadata — read by the core at discovery time.
 * Analogous to the `contributes` section in a VSCode extension's package.json.
 */
export interface MiniAppManifest {
  /** Unique identifier, e.g. "note" */
  id: string;
  /** Display name shown in the Dock */
  name: string;
  /** Icon (emoji string or path) */
  icon: string;
  /** SemVer version */
  version: string;
  /** Optional human-readable description */
  description?: string;
}

/**
 * Returned from the backend activate() — reserved for future contribution
 * points. The backend no longer returns a React component.
 */
export type MiniAppBackendActivation = Record<string, never>;

/**
 * @deprecated Use MiniAppBackendActivation instead. The old activate() returned
 * a React component, but the new architecture separates backend and frontend
 * into two entry files. The frontend entry exports the React component directly.
 */
export interface MiniAppActivation {
  /** Root React component rendered inside the DeskTalk window */
  component: React.ComponentType;
}
