import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { getWorkspacePaths, getUserHomeDir } from './workspace';

type PreferenceValue = string | number | boolean;

interface PreferenceStoreFile {
  config?: Record<string, PreferenceValue>;
}

/** The username whose preferences should be read. Defaults to 'admin'. */
let currentPreferenceUser = 'admin';

/**
 * Set the active user for preference reads.
 * Called when a WebSocket user authenticates.
 */
export function setPreferenceUser(username: string): void {
  currentPreferenceUser = username;
}

function readPreferenceStore(): Record<string, PreferenceValue> {
  const workspace = getWorkspacePaths();

  // Try the per-user path first
  const userPath = join(getUserHomeDir(currentPreferenceUser), '.storage', 'preference.json');
  if (existsSync(userPath)) {
    try {
      const parsed = JSON.parse(readFileSync(userPath, 'utf-8')) as PreferenceStoreFile;
      return parsed.config ?? {};
    } catch {
      // Fall through to legacy path
    }
  }

  // Fallback to legacy global path (pre-migration)
  const legacyPath = join(workspace.data, 'storage', 'preference.json');
  if (!existsSync(legacyPath)) {
    return {};
  }

  try {
    const parsed = JSON.parse(readFileSync(legacyPath, 'utf-8')) as PreferenceStoreFile;
    return parsed.config ?? {};
  } catch {
    return {};
  }
}

export function getStoredPreference(key: string): PreferenceValue | undefined {
  return readPreferenceStore()[key];
}

/**
 * Get the path to the active preference storage file.
 */
function getPreferenceStorePath(): string {
  return join(getUserHomeDir(currentPreferenceUser), '.storage', 'preference.json');
}

/**
 * Write a single preference key into the store.
 * Creates the storage file if it does not exist.
 */
export function setStoredPreference(key: string, value: PreferenceValue): void {
  const filePath = getPreferenceStorePath();
  let store: Record<string, unknown> = {};

  if (existsSync(filePath)) {
    try {
      store = JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
    } catch {
      store = {};
    }
  }

  const config = (store.config ?? {}) as Record<string, PreferenceValue>;
  config[key] = value;
  store.config = config;

  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf-8');
}

/**
 * Delete a single preference key from the store.
 */
export function deleteStoredPreference(key: string): void {
  const filePath = getPreferenceStorePath();
  if (!existsSync(filePath)) return;

  let store: Record<string, unknown> = {};
  try {
    store = JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
  } catch {
    return;
  }

  const config = (store.config ?? {}) as Record<string, PreferenceValue>;
  delete config[key];
  store.config = config;

  writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf-8');
}

/**
 * Get all current settings values for a specific MiniApp.
 * Reads keys prefixed with `miniapps.<id>.` from the preference store
 * and returns them as a flat map with the prefix stripped.
 */
export function getMiniAppSettingsValues(miniAppId: string): Record<string, PreferenceValue> {
  const all = readPreferenceStore();
  const prefix = `miniapps.${miniAppId}.`;
  const result: Record<string, PreferenceValue> = {};
  for (const [key, value] of Object.entries(all)) {
    if (key.startsWith(prefix)) {
      result[key.slice(prefix.length)] = value;
    }
  }
  return result;
}
