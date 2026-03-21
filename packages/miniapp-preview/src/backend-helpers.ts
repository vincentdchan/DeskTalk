import { mkdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { StreamedHtmlSnapshot } from './types';
import { stripDtInjections } from './strip-dt-injections';

export { stripDtInjections } from './strip-dt-injections';

const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

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

export function sanitizeTitleSegment(title: string): string {
  const normalized = title.trim().toLowerCase().replace(/\s+/g, '-');
  const safe = normalized.replace(/[^a-z0-9._-]/g, '');
  return safe || 'preview';
}

export function getStreamedDirectoryName(streamId: string, title: string): string {
  return `${sanitizeTitleSegment(title)}_${streamId}`;
}

export function getStreamedFileName(): string {
  return 'index.html';
}

export function getStreamedRelativePath(streamId: string, title: string): string {
  return `streamed/${getStreamedDirectoryName(streamId, title)}/${getStreamedFileName()}`;
}

export function getStreamedAbsolutePath(dataDir: string, streamId: string, title: string): string {
  return join(
    dataDir,
    'streamed',
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
  dataDir: string,
  streamId: string,
  title: string,
): string {
  return join(dataDir, 'streamed', getLegacyStreamedFileName(streamId, title));
}

export async function loadStreamedHtml(
  dataDir: string,
  streamId: string,
  title: string,
): Promise<StreamedHtmlSnapshot | null> {
  const path = getStreamedAbsolutePath(dataDir, streamId, title);
  try {
    const content = await readFile(path, 'utf8');
    return {
      name: fileName(path),
      path: getStreamedRelativePath(streamId, title),
      content,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  const legacyPath = getLegacyStreamedAbsolutePath(dataDir, streamId, title);
  try {
    const content = await readFile(legacyPath, 'utf8');
    return {
      name: fileName(legacyPath),
      path: getLegacyStreamedRelativePath(streamId, title),
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
  dataDir: string,
  streamId: string,
  title: string,
  content: string,
): Promise<StreamedHtmlSnapshot> {
  const path = getStreamedAbsolutePath(dataDir, streamId, title);
  const strippedContent = stripDtInjections(content);
  mkdirSync(dirname(path), { recursive: true });
  await writeFile(path, strippedContent, 'utf8');
  return {
    name: fileName(path),
    path: getStreamedRelativePath(streamId, title),
    content: strippedContent,
  };
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
