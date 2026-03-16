import type { MiniAppManifest, MiniAppContext, MiniAppBackendActivation } from '@desktalk/sdk';
import type { PreviewFile, SiblingList, SiblingEntry } from './types';

// ─── Manifest ────────────────────────────────────────────────────────────────

export const manifest: MiniAppManifest = {
  id: 'preview',
  name: 'Preview',
  icon: '\uD83D\uDDBC\uFE0F',
  version: '0.1.0',
  description: 'Image viewer for JPEG, PNG, and WebP files',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

function getExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot).toLowerCase() : '';
}

function getMimeType(name: string): string | null {
  return MIME_MAP[getExtension(name)] ?? null;
}

function isSupported(name: string): boolean {
  return SUPPORTED_EXTENSIONS.has(getExtension(name));
}

function parentDir(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx > 0 ? path.slice(0, idx) : '.';
}

function fileName(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx >= 0 ? path.slice(idx + 1) : path;
}

/**
 * Parse image dimensions from base64-encoded data.
 * Supports PNG, JPEG, and WebP headers.
 */
function parseImageDimensions(base64: string, mimeType: string): { width: number; height: number } {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  if (mimeType === 'image/png') {
    // PNG: width at bytes 16-19, height at bytes 20-23 (big-endian)
    if (bytes.length >= 24) {
      const width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
      const height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
      return { width, height };
    }
  }

  if (mimeType === 'image/jpeg') {
    // JPEG: search for SOF0/SOF2 markers (0xFF 0xC0 or 0xFF 0xC2)
    let offset = 2; // skip SOI marker
    while (offset < bytes.length - 8) {
      if (bytes[offset] !== 0xff) break;
      const marker = bytes[offset + 1];
      if (marker === 0xc0 || marker === 0xc2) {
        const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
        const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
        return { width, height };
      }
      // Skip to next marker
      const segmentLength = (bytes[offset + 2] << 8) | bytes[offset + 3];
      offset += 2 + segmentLength;
    }
  }

  if (mimeType === 'image/webp') {
    // WebP: check for VP8/VP8L/VP8X chunks
    if (bytes.length >= 30) {
      const riff = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
      const webp = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
      if (riff === 'RIFF' && webp === 'WEBP') {
        const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
        if (chunk === 'VP8 ' && bytes.length >= 30) {
          // Lossy VP8: width/height at bytes 26-29
          const width = (bytes[26] | (bytes[27] << 8)) & 0x3fff;
          const height = (bytes[28] | (bytes[29] << 8)) & 0x3fff;
          return { width, height };
        }
        if (chunk === 'VP8L' && bytes.length >= 25) {
          // Lossless VP8L: signature byte then 4 bytes of packed w/h
          const b0 = bytes[21];
          const b1 = bytes[22];
          const b2 = bytes[23];
          const b3 = bytes[24];
          const width = ((b0 | (b1 << 8)) & 0x3fff) + 1;
          const height = (((b1 >> 6) | (b2 << 2) | (b3 << 10)) & 0x3fff) + 1;
          return { width, height };
        }
        if (chunk === 'VP8X' && bytes.length >= 30) {
          // Extended VP8X: width at 24-26, height at 27-29
          const width = (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)) + 1;
          const height = (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) + 1;
          return { width, height };
        }
      }
    }
  }

  return { width: 0, height: 0 };
}

// ─── Activate ────────────────────────────────────────────────────────────────

export function activate(ctx: MiniAppContext): MiniAppBackendActivation {
  ctx.logger.info('Preview MiniApp activated');

  /**
   * Build a PreviewFile from a file path.
   */
  async function buildPreviewFile(path: string): Promise<PreviewFile> {
    const name = fileName(path);
    const mimeType = getMimeType(name);
    if (!mimeType) {
      throw new Error(`Unsupported format: ${name}`);
    }

    const base64 = await ctx.fs.readFileBase64(path);
    const dataUrl = `data:${mimeType};base64,${base64}`;
    const { width, height } = parseImageDimensions(base64, mimeType);

    return { name, path, mimeType, dataUrl, width, height };
  }

  /**
   * List supported image siblings in the same directory as the given file.
   */
  async function listSiblings(path: string): Promise<SiblingList> {
    const dir = parentDir(path);
    const entries = await ctx.fs.readDir(dir);

    const siblings: SiblingEntry[] = [];
    for (const entry of entries) {
      if (entry.type === 'file' && isSupported(entry.name)) {
        siblings.push({ name: entry.name, path: entry.path });
      }
    }

    // Sort alphabetically
    siblings.sort((a, b) => a.name.localeCompare(b.name));

    const currentIndex = siblings.findIndex((s) => s.path === path);
    return { files: siblings, currentIndex };
  }

  // ─── preview.open ─────────────────────────────────────────────────────────

  ctx.messaging.onCommand<{ path: string }, PreviewFile>('preview.open', async (req) =>
    buildPreviewFile(req.path),
  );

  // ─── preview.siblings ─────────────────────────────────────────────────────

  ctx.messaging.onCommand<{ path: string }, SiblingList>('preview.siblings', async (req) =>
    listSiblings(req.path),
  );

  // ─── preview.next ─────────────────────────────────────────────────────────

  ctx.messaging.onCommand<{ currentPath: string }, PreviewFile>('preview.next', async (req) => {
    const { files, currentIndex } = await listSiblings(req.currentPath);
    if (files.length === 0) {
      throw new Error('No images in directory');
    }
    const nextIndex = (currentIndex + 1) % files.length;
    return buildPreviewFile(files[nextIndex].path);
  });

  // ─── preview.previous ─────────────────────────────────────────────────────

  ctx.messaging.onCommand<{ currentPath: string }, PreviewFile>('preview.previous', async (req) => {
    const { files, currentIndex } = await listSiblings(req.currentPath);
    if (files.length === 0) {
      throw new Error('No images in directory');
    }
    const prevIndex = (currentIndex - 1 + files.length) % files.length;
    return buildPreviewFile(files[prevIndex].path);
  });

  return {};
}

export function deactivate(): void {
  // cleanup
}
