import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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
