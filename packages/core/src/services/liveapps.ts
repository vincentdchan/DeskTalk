import type { MiniAppManifest } from '@desktalk/sdk';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { buildLiveAppIconUrl } from './liveapp-icon';

const LIVEAPP_DEFAULT_ICON = '📄';
const LIVEAPP_TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/i;

export interface LiveAppEntry {
  id: string;
  name: string;
  path: string;
  icon: string;
  iconPng?: string;
}

function createLiveAppError(message: string, code: 'EINVAL' | 'ENOENT'): NodeJS.ErrnoException {
  const error = new Error(message) as NodeJS.ErrnoException;
  error.code = code;
  return error;
}

function assertValidLiveAppId(id: string): void {
  if (!id || id.includes('/') || id.includes('\\') || id.includes('..') || id.includes('\0')) {
    throw createLiveAppError('Invalid LiveApp id', 'EINVAL');
  }
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'");
}

export function extractLiveAppTitle(html: string): string | null {
  const match = html.match(LIVEAPP_TITLE_RE);
  if (!match) {
    return null;
  }

  const title = decodeHtmlEntities(match[1].replace(/\s+/g, ' ').trim());
  return title || null;
}

export function listLiveApps(userHomeDir: string): LiveAppEntry[] {
  const liveAppsDir = join(userHomeDir, '.data', 'liveapps');

  let entries: string[] = [];
  try {
    entries = readdirSync(liveAppsDir);
  } catch {
    return [];
  }

  return entries
    .map((entryName) => {
      const directoryPath = join(liveAppsDir, entryName);
      let stats;
      try {
        stats = statSync(directoryPath);
      } catch {
        return null;
      }

      if (!stats.isDirectory()) {
        return null;
      }

      const absoluteHtmlPath = join(directoryPath, 'index.html');
      let html: string;
      try {
        html = readFileSync(absoluteHtmlPath, 'utf8');
      } catch {
        return null;
      }

      const title = extractLiveAppTitle(html) ?? entryName;
      const iconPath = join(directoryPath, 'icon.png');
      let iconPng: string | undefined;
      if (existsSync(iconPath)) {
        try {
          iconPng = buildLiveAppIconUrl(entryName, statSync(iconPath).mtimeMs);
        } catch {
          iconPng = buildLiveAppIconUrl(entryName);
        }
      }

      return {
        id: entryName,
        name: title,
        path: `.data/liveapps/${entryName}/index.html`,
        icon: LIVEAPP_DEFAULT_ICON,
        ...(iconPng ? { iconPng } : {}),
      } satisfies LiveAppEntry;
    })
    .filter((entry): entry is LiveAppEntry => entry !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function removeLiveApp(userHomeDir: string, id: string): Promise<void> {
  assertValidLiveAppId(id);

  const liveAppDir = join(userHomeDir, '.data', 'liveapps', id);

  let stats;
  try {
    stats = await stat(liveAppDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw createLiveAppError('LiveApp not found', 'ENOENT');
    }
    throw error;
  }

  if (!stats.isDirectory()) {
    throw createLiveAppError('LiveApp not found', 'ENOENT');
  }

  await rm(liveAppDir, { recursive: true, force: true });
}

export function toLiveAppManifest(entry: LiveAppEntry): MiniAppManifest {
  return {
    id: entry.id,
    name: entry.name,
    icon: entry.icon,
    version: '0.0.0',
    description: 'AI-generated LiveApp',
  };
}
