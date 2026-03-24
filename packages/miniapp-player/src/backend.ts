import type {
  FileEntry,
  MiniAppBackendActivation,
  MiniAppContext,
  MiniAppManifest,
} from '@desktalk/sdk';
import type { MediaFile, MediaKind, SiblingEntry, SiblingList } from './types';

const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov']);

const MIME_TYPES: Record<string, string> = {
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
};

export const manifest: MiniAppManifest = {
  id: 'player',
  name: 'Player',
  icon: '\u{1F3B5}',
  version: '0.1.0',
  description: 'Audio and video player for media files',
  fileAssociations: {
    extensions: [...AUDIO_EXTENSIONS, ...VIDEO_EXTENSIONS],
    mimeTypes: Object.values(MIME_TYPES),
  },
};

function fileName(path: string): string {
  const index = path.lastIndexOf('/');
  return index >= 0 ? path.slice(index + 1) : path;
}

function parentDir(path: string): string {
  const index = path.lastIndexOf('/');
  return index >= 0 ? path.slice(0, index) : '.';
}

function getExtension(path: string): string {
  const name = fileName(path).toLowerCase();
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index) : '';
}

function getMediaKind(path: string): MediaKind | null {
  const ext = getExtension(path);
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  return null;
}

function getMimeType(path: string): string | null {
  return MIME_TYPES[getExtension(path)] ?? null;
}

export function activate(ctx: MiniAppContext): MiniAppBackendActivation {
  ctx.logger.info('Player MiniApp activated');

  async function buildMediaFile(path: string): Promise<MediaFile> {
    const kind = getMediaKind(path);
    const mimeType = getMimeType(path);

    if (!kind || !mimeType) {
      throw new Error(`Unsupported media format: ${fileName(path)}`);
    }

    const stat = await ctx.fs.stat(path);
    if (stat.type !== 'file') {
      throw new Error(`Not a file: ${path}`);
    }

    const base64 = await ctx.fs.readFileBase64(path);
    return {
      name: fileName(path),
      path,
      mimeType,
      dataUrl: `data:${mimeType};base64,${base64}`,
      kind,
    };
  }

  async function listSiblings(path: string): Promise<SiblingList> {
    const kind = getMediaKind(path);
    if (!kind) {
      throw new Error(`Unsupported media format: ${fileName(path)}`);
    }

    const entries = await ctx.fs.readDir(parentDir(path));
    const files: SiblingEntry[] = entries
      .filter((entry: FileEntry) => entry.type === 'file' && getMediaKind(entry.path) === kind)
      .map((entry: FileEntry) => ({ name: entry.name, path: entry.path }))
      .sort((a: SiblingEntry, b: SiblingEntry) => a.name.localeCompare(b.name));

    return {
      files,
      currentIndex: files.findIndex((entry) => entry.path === path),
    };
  }

  async function navigate(path: string, direction: 1 | -1): Promise<MediaFile> {
    const siblings = await listSiblings(path);
    if (siblings.files.length === 0) {
      throw new Error('No media files found in this directory.');
    }

    const baseIndex = siblings.currentIndex >= 0 ? siblings.currentIndex : 0;
    const nextIndex = (baseIndex + direction + siblings.files.length) % siblings.files.length;
    return buildMediaFile(siblings.files[nextIndex].path);
  }

  ctx.messaging.onCommand<{ path: string }, MediaFile>(
    'player.open',
    async (req: { path: string }) => buildMediaFile(req.path),
  );

  ctx.messaging.onCommand<{ path: string }, SiblingList>(
    'player.siblings',
    async (req: { path: string }) => listSiblings(req.path),
  );

  ctx.messaging.onCommand<{ currentPath: string }, MediaFile>(
    'player.next',
    async (req: { currentPath: string }) => navigate(req.currentPath, 1),
  );

  ctx.messaging.onCommand<{ currentPath: string }, MediaFile>(
    'player.previous',
    async (req: { currentPath: string }) => navigate(req.currentPath, -1),
  );

  return {};
}

export function deactivate(): void {
  // cleanup
}
