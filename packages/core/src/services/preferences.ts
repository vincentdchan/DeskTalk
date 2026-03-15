import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getWorkspacePaths } from './workspace';

type PreferenceValue = string | number | boolean;

interface PreferenceStoreFile {
  config?: Record<string, PreferenceValue>;
}

function readPreferenceStore(): Record<string, PreferenceValue> {
  const workspace = getWorkspacePaths();
  const filePath = join(workspace.data, 'storage', 'preference.json');

  if (!existsSync(filePath)) {
    return {};
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as PreferenceStoreFile;
    return parsed.config ?? {};
  } catch {
    return {};
  }
}

export function getStoredPreference(key: string): PreferenceValue | undefined {
  return readPreferenceStore()[key];
}
