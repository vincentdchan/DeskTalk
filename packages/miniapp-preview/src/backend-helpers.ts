import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import type { StreamedHtmlSnapshot } from './types';
import { getStreamedDirectoryName, sanitizeTitleSegment } from './liveapp-id';
import { stripDtInjections } from './strip-dt-injections';

export { stripDtInjections } from './strip-dt-injections';
export { getStreamedDirectoryName, sanitizeTitleSegment } from './liveapp-id';

const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

const GIT_IGNORE_CONTENT = ['.DS_Store', '.dt-redo-stack.json', ''].join('\n');

export function getExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot).toLowerCase() : '';
}

export function getMimeType(name: string): string | null {
  return MIME_MAP[getExtension(name)] ?? null;
}

export function isSupported(name: string): boolean {
  return SUPPORTED_EXTENSIONS.has(getExtension(name));
}

export function parentDir(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx > 0 ? path.slice(0, idx) : '.';
}

export function fileName(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx >= 0 ? path.slice(idx + 1) : path;
}

export function getStreamedFileName(): string {
  return 'index.html';
}

export function getStreamedRelativePath(streamId: string, title: string): string {
  return `.data/liveapps/${getStreamedDirectoryName(streamId, title)}/${getStreamedFileName()}`;
}

export function getStreamedAbsolutePath(homeDir: string, streamId: string, title: string): string {
  return join(
    homeDir,
    '.data',
    'liveapps',
    getStreamedDirectoryName(streamId, title),
    getStreamedFileName(),
  );
}

export function getLegacyStreamedFileName(streamId: string, title: string): string {
  return `${streamId}-${sanitizeTitleSegment(title)}.html`;
}

export function getLegacyStreamedRelativePath(streamId: string, title: string): string {
  return `streamed/${getLegacyStreamedFileName(streamId, title)}`;
}

export function getLegacyStreamedAbsolutePath(
  legacyDataDir: string,
  streamId: string,
  title: string,
): string {
  return join(legacyDataDir, 'streamed', getLegacyStreamedFileName(streamId, title));
}

export async function loadStreamedHtml(
  homeDir: string,
  streamId: string,
  title: string,
  legacyDataDir?: string,
): Promise<StreamedHtmlSnapshot | null> {
  const path = getStreamedAbsolutePath(homeDir, streamId, title);
  try {
    const content = await readFile(path, 'utf8');
    return {
      name: fileName(path),
      path,
      content,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  if (!legacyDataDir) {
    return null;
  }

  const legacyPath = getLegacyStreamedAbsolutePath(legacyDataDir, streamId, title);
  try {
    const content = await readFile(legacyPath, 'utf8');
    return {
      name: fileName(legacyPath),
      path: legacyPath,
      content,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function saveStreamedHtml(
  homeDir: string,
  streamId: string,
  title: string,
  content: string,
): Promise<StreamedHtmlSnapshot> {
  const path = getStreamedAbsolutePath(homeDir, streamId, title);
  const liveAppDir = join(homeDir, '.data', 'liveapps', getStreamedDirectoryName(streamId, title));
  const strippedContent = stripDtInjections(content);
  mkdirSync(liveAppDir, { recursive: true });
  await writeFile(path, strippedContent, 'utf8');
  await initializeLiveAppRepo(liveAppDir);
  return {
    name: fileName(path),
    path,
    content: strippedContent,
  };
}

async function initializeLiveAppRepo(liveAppDir: string): Promise<void> {
  const git = simpleGit(liveAppDir);
  let repoWasCreated = false;

  if (!existsSync(join(liveAppDir, '.git'))) {
    await git.init();
    await git.addConfig('user.name', 'DeskTalk', false, 'local');
    await git.addConfig('user.email', 'desktalk@local', false, 'local');
    repoWasCreated = true;
  }

  const gitIgnorePath = join(liveAppDir, '.gitignore');
  if (!existsSync(gitIgnorePath)) {
    writeFileSync(gitIgnorePath, GIT_IGNORE_CONTENT, 'utf8');
  }

  const hasHead = await git.revparse(['--verify', 'HEAD']).then(
    () => true,
    () => false,
  );
  if (repoWasCreated || !hasHead) {
    await git.add('.');
    await git.commit('Initial LiveApp snapshot');
  }
}

export function parseImageDimensions(
  base64: string,
  mimeType: string,
): { width: number; height: number } {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  if (mimeType === 'image/png') {
    if (bytes.length >= 24) {
      const width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
      const height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
      return { width, height };
    }
  }

  if (mimeType === 'image/jpeg') {
    let offset = 2;
    while (offset < bytes.length - 8) {
      if (bytes[offset] !== 0xff) break;
      const marker = bytes[offset + 1];
      if (marker === 0xc0 || marker === 0xc2) {
        const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
        const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
        return { width, height };
      }
      const segmentLength = (bytes[offset + 2] << 8) | bytes[offset + 3];
      offset += 2 + segmentLength;
    }
  }

  if (mimeType === 'image/webp') {
    if (bytes.length >= 30) {
      const riff = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
      const webp = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
      if (riff === 'RIFF' && webp === 'WEBP') {
        const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
        if (chunk === 'VP8 ' && bytes.length >= 30) {
          const width = (bytes[26] | (bytes[27] << 8)) & 0x3fff;
          const height = (bytes[28] | (bytes[29] << 8)) & 0x3fff;
          return { width, height };
        }
        if (chunk === 'VP8L' && bytes.length >= 25) {
          const b0 = bytes[21];
          const b1 = bytes[22];
          const b2 = bytes[23];
          const b3 = bytes[24];
          const width = ((b0 | (b1 << 8)) & 0x3fff) + 1;
          const height = (((b1 >> 6) | (b2 << 2) | (b3 << 10)) & 0x3fff) + 1;
          return { width, height };
        }
        if (chunk === 'VP8X' && bytes.length >= 30) {
          const width = (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)) + 1;
          const height = (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) + 1;
          return { width, height };
        }
      }
    }
  }

  return { width: 0, height: 0 };
}
