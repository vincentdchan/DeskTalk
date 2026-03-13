import type React from 'react';

/**
 * Static metadata — read by the core at discovery time.
 * Analogous to the `contributes` section in a VSCode extension's package.json.
 */
export interface MiniAppManifest {
  /** Unique identifier, e.g. "note" */
  id: string;
  /** Display name shown in the Dock */
  name: string;
  /** Icon (path or React component) */
  icon: string | React.ComponentType;
  /** SemVer version */
  version: string;
  /** Optional human-readable description */
  description?: string;
}

/**
 * Returned from activate() — tells the core what to render.
 */
export interface MiniAppActivation {
  /** Root React component rendered inside the DeskTalk window */
  component: React.ComponentType;
}
