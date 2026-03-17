/**
 * MiniApp user settings schema and runtime hook types.
 *
 * Each MiniApp can declare user-configurable settings via a settings-schema.json
 * file referenced from package.json. The core discovers the schema at registration
 * time and the Preference MiniApp renders all MiniApp settings in a unified UI.
 * Values are stored as TOML under [miniapps.<id>] in the global config.toml.
 */

import type { Disposable } from './context';

// ─── Schema Types (JSON file format) ────────────────────────────────────────

/**
 * Root schema document — the contents of settings-schema.json.
 */
export interface SettingsSchemaDocument {
  /** Optional JSON Schema URI for IDE validation */
  $schema?: string;
  /** Schema format version — always 1 for now */
  version: 1;
  /** Map of setting key to definition */
  settings: Record<string, SettingDefinition>;
}

/**
 * A single setting definition within the schema.
 */
export type SettingDefinition =
  | StringSettingDefinition
  | NumberSettingDefinition
  | BooleanSettingDefinition;

/**
 * Shared properties for all setting types.
 */
export interface BaseSettingDefinition {
  /** Human-readable label shown in Preference UI */
  title: string;
  /** Longer description shown below the label */
  description: string;
  /** Grouping category within this MiniApp's settings panel */
  category?: string;
  /** Sort order within the category (ascending, default 0) */
  order?: number;
  /** If true, value is masked in UI and omitted from broadcasts */
  sensitive?: boolean;
  /** If true, changing this setting requires an app restart */
  requiresRestart?: boolean;
  /** Deprecation notice — setting may be hidden from main view */
  deprecationMessage?: string;
}

export interface StringSettingDefinition extends BaseSettingDefinition {
  type: 'string';
  default: string;
  /** Renders a dropdown instead of free-text input */
  enum?: string[];
  /** Human-readable labels for each enum value (parallel array) */
  enumDescriptions?: string[];
  /** Regex pattern for validation */
  pattern?: string;
  /** Maximum string length */
  maxLength?: number;
}

export interface NumberSettingDefinition extends BaseSettingDefinition {
  type: 'number';
  default: number;
  minimum?: number;
  maximum?: number;
}

export interface BooleanSettingDefinition extends BaseSettingDefinition {
  type: 'boolean';
  default: boolean;
}

// ─── Runtime Hook ────────────────────────────────────────────────────────────

/**
 * Scoped, read-only access to a MiniApp's own user settings.
 * Values are stored in [miniapps.<id>] in config.toml.
 * All writes go through the Preference MiniApp.
 */
export interface SettingsHook {
  /** Get a single setting value. Falls back to schema default if not set. */
  get<T extends string | number | boolean>(key: string): Promise<T>;
  /** Get all settings for this MiniApp as a flat key-value map. */
  getAll(): Promise<Record<string, string | number | boolean>>;
  /**
   * Subscribe to changes for this MiniApp's settings.
   * Called when the Preference MiniApp writes a new value.
   */
  onChange(
    handler: (change: { key: string; value: string | number | boolean }) => void,
  ): Disposable;
}
