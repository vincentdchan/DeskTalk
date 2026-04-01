import type { MiniAppManifest, MiniAppContext, MiniAppBackendActivation } from '@desktalk/sdk';
import type { FileEntry } from './types';

// ─── Manifest ────────────────────────────────────────────────────────────────

export const manifest: MiniAppManifest = {
  id: 'file-explorer',
  name: 'File Explorer',
  icon: '\uD83D\uDCC1',
  version: '0.1.0',
  description: 'Browse and manage files in your workspace',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TEXT_EXTENSIONS = new Set([
  '.md',
  '.txt',
  '.json',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.css',
  '.scss',
  '.html',
  '.xml',
  '.yaml',
  '.yml',
  '.toml',
  '.ini',
  '.cfg',
  '.sh',
  '.bash',
  '.py',
  '.rb',
  '.go',
  '.rs',
  '.java',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
  '.csv',
  '.log',
  '.env',
  '.gitignore',
  '.editorconfig',
]);

const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.webp',
  '.bmp',
  '.ico',
]);

const MIME_MAP: Record<string, string> = {
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.ts': 'text/typescript',
  '.tsx': 'text/typescript',
  '.js': 'text/javascript',
  '.jsx': 'text/javascript',
  '.css': 'text/css',
  '.scss': 'text/scss',
  '.html': 'text/html',
  '.xml': 'text/xml',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml',
  '.toml': 'text/toml',
  '.sh': 'text/x-shellscript',
  '.py': 'text/x-python',
  '.rb': 'text/x-ruby',
  '.go': 'text/x-go',
  '.rs': 'text/x-rust',
  '.java': 'text/x-java',
  '.c': 'text/x-c',
  '.cpp': 'text/x-c++',
  '.h': 'text/x-c',
  '.hpp': 'text/x-c++',
  '.csv': 'text/csv',
  '.log': 'text/plain',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
};

function getExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot).toLowerCase() : '';
}

function getMimeType(name: string): string | null {
  const ext = getExtension(name);
  return MIME_MAP[ext] ?? null;
}

function isTextFile(name: string): boolean {
  const ext = getExtension(name);
  if (TEXT_EXTENSIONS.has(ext)) return true;
  // Files with no extension are treated as text
  if (!ext && !IMAGE_EXTENSIONS.has(ext)) return true;
  return false;
}

function joinPath(...parts: string[]): string {
  return parts.join('/').replace(/\/+/g, '/').replace(/\/$/, '') || '.';
}

function normalizePath(path: string): string {
  // Remove leading/trailing slashes, normalize to relative
  return path.replace(/^\/+/, '').replace(/\/+$/, '') || '.';
}

// ─── Activate ────────────────────────────────────────────────────────────────

export function activate(ctx: MiniAppContext): MiniAppBackendActivation {
  ctx.logger.info('File Explorer MiniApp activated');

  /** Build a FileEntry from a directory entry and stat info. */
  async function buildFileEntry(dirPath: string, name: string): Promise<FileEntry> {
    const entryPath = dirPath === '.' ? name : joinPath(dirPath, name);
    const stat = await ctx.fs.stat(entryPath);
    return {
      name,
      path: entryPath,
      type: stat.type,
      size: stat.type === 'file' ? stat.size : null,
      mimeType: stat.type === 'file' ? getMimeType(name) : null,
      modifiedAt: stat.modifiedAt,
    };
  }

  // ─── files.list ──────────────────────────────────────────────────────────

  const LIST_DEFAULT_LIMIT = 50;
  const LIST_MAX_LIMIT = 200;

  ctx.messaging.onCommand<{ path: string; limit?: number }, FileEntry[]>(
    'files.list',
    async (req) => {
      const dirPath = normalizePath(req?.path || '.');
      const limit = Math.max(1, Math.min(req?.limit ?? LIST_DEFAULT_LIMIT, LIST_MAX_LIMIT));

      const dirExists = await ctx.fs.exists(dirPath);
      if (!dirExists) {
        await ctx.fs.mkdir(dirPath);
        return [];
      }

      const entries = await ctx.fs.readDir(dirPath);
      const result: FileEntry[] = [];

      for (const entry of entries) {
        try {
          const fileEntry = await buildFileEntry(dirPath, entry.name);
          result.push(fileEntry);
        } catch {
          // Skip entries that can't be stat'd
        }
      }

      // Sort: directories first, then alphabetically
      result.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      return result.slice(0, limit);
    },
  );

  // ─── files.read ──────────────────────────────────────────────────────────

  ctx.messaging.onCommand<{ path: string }, { content: string; mimeType: string }>(
    'files.read',
    async (req) => {
      const filePath = normalizePath(req.path);
      const content = await ctx.fs.readFile(filePath);
      const mimeType = getMimeType(filePath) || 'text/plain';
      return { content, mimeType };
    },
  );

  // ─── files.create ────────────────────────────────────────────────────────

  ctx.messaging.onCommand<
    { path: string; type: 'file' | 'directory'; content?: string },
    FileEntry
  >('files.create', async (req) => {
    const targetPath = normalizePath(req.path);

    if (req.type === 'directory') {
      await ctx.fs.mkdir(targetPath);
    } else {
      await ctx.fs.writeFile(targetPath, req.content ?? '');
    }

    const stat = await ctx.fs.stat(targetPath);
    const name = targetPath.includes('/') ? targetPath.split('/').pop()! : targetPath;

    ctx.logger.info(`Created ${req.type}: ${targetPath}`);
    return {
      name,
      path: targetPath,
      type: req.type,
      size: req.type === 'file' ? stat.size : null,
      mimeType: req.type === 'file' ? getMimeType(name) : null,
      modifiedAt: stat.modifiedAt,
    };
  });

  // ─── files.upload ────────────────────────────────────────────────────────

  ctx.messaging.onCommand<{ path: string; contentBase64: string }, FileEntry>(
    'files.upload',
    async (req) => {
      const targetPath = normalizePath(req.path);
      await ctx.fs.writeFileBase64(targetPath, req.contentBase64);

      const stat = await ctx.fs.stat(targetPath);
      const name = targetPath.includes('/') ? targetPath.split('/').pop()! : targetPath;

      ctx.logger.info(`Uploaded file: ${targetPath}`);
      return {
        name,
        path: targetPath,
        type: 'file',
        size: stat.size,
        mimeType: getMimeType(name),
        modifiedAt: stat.modifiedAt,
      };
    },
  );

  // ─── files.rename ────────────────────────────────────────────────────────

  ctx.messaging.onCommand<{ path: string; newName: string }, FileEntry>(
    'files.rename',
    async (req) => {
      const oldPath = normalizePath(req.path);
      const parentDir = oldPath.includes('/') ? oldPath.slice(0, oldPath.lastIndexOf('/')) : '.';
      const newPath = parentDir === '.' ? req.newName : joinPath(parentDir, req.newName);

      await ctx.fs.rename(oldPath, newPath);

      const newStat = await ctx.fs.stat(newPath);
      ctx.logger.info(`Renamed: ${oldPath} -> ${newPath}`);
      return {
        name: req.newName,
        path: newPath,
        type: newStat.type,
        size: newStat.type === 'file' ? newStat.size : null,
        mimeType: newStat.type === 'file' ? getMimeType(req.newName) : null,
        modifiedAt: newStat.modifiedAt,
      };
    },
  );

  // ─── files.delete ────────────────────────────────────────────────────────

  ctx.messaging.onCommand<{ path: string }, void>('files.delete', async (req) => {
    const targetPath = normalizePath(req.path);
    await ctx.fs.deleteFile(targetPath);

    ctx.logger.info(`Deleted: ${targetPath}`);
  });

  // ─── files.move ──────────────────────────────────────────────────────────

  ctx.messaging.onCommand<{ source: string; destination: string }, FileEntry>(
    'files.move',
    async (req) => {
      const source = normalizePath(req.source);
      const destination = normalizePath(req.destination);

      await ctx.fs.rename(source, destination);

      const newStat = await ctx.fs.stat(destination);
      const name = destination.includes('/') ? destination.split('/').pop()! : destination;

      ctx.logger.info(`Moved: ${source} -> ${destination}`);
      return {
        name,
        path: destination,
        type: newStat.type,
        size: newStat.type === 'file' ? newStat.size : null,
        mimeType: newStat.type === 'file' ? getMimeType(name) : null,
        modifiedAt: newStat.modifiedAt,
      };
    },
  );

  // ─── files.copy ──────────────────────────────────────────────────────────

  ctx.messaging.onCommand<{ source: string; destination: string }, FileEntry>(
    'files.copy',
    async (req) => {
      const source = normalizePath(req.source);
      const destination = normalizePath(req.destination);

      const stat = await ctx.fs.stat(source);

      if (stat.type === 'file') {
        const content = await ctx.fs.readFile(source);
        await ctx.fs.writeFile(destination, content);
      } else {
        await copyRecursive(source, destination);
      }

      const newStat = await ctx.fs.stat(destination);
      const name = destination.includes('/') ? destination.split('/').pop()! : destination;

      ctx.logger.info(`Copied: ${source} -> ${destination}`);
      return {
        name,
        path: destination,
        type: newStat.type,
        size: newStat.type === 'file' ? newStat.size : null,
        mimeType: newStat.type === 'file' ? getMimeType(name) : null,
        modifiedAt: newStat.modifiedAt,
      };
    },
  );

  // ─── Preferences ─────────────────────────────────────────────────────────

  interface Preferences {
    viewMode: 'list' | 'icon';
  }

  const DEFAULT_PREFERENCES: Preferences = {
    viewMode: 'list',
  };

  ctx.messaging.onCommand<void, Preferences>('prefs.get', async () => {
    const stored = await ctx.storage.get<Partial<Preferences>>('prefs');
    return { ...DEFAULT_PREFERENCES, ...stored };
  });

  ctx.messaging.onCommand<Preferences, void>('prefs.set', async (req) => {
    const stored = await ctx.storage.get<Partial<Preferences>>('prefs');
    await ctx.storage.set('prefs', { ...stored, ...req });
    ctx.logger.info('Preferences saved');
  });

  // ─── Recursive helpers ───────────────────────────────────────────────────

  async function copyRecursive(source: string, destination: string): Promise<void> {
    const stat = await ctx.fs.stat(source);

    if (stat.type === 'file') {
      const content = await ctx.fs.readFile(source);
      await ctx.fs.writeFile(destination, content);
    } else {
      await ctx.fs.mkdir(destination);
      const entries = await ctx.fs.readDir(source);
      for (const entry of entries) {
        await copyRecursive(joinPath(source, entry.name), joinPath(destination, entry.name));
      }
    }
  }

  return {};
}

export { isTextFile, getExtension, IMAGE_EXTENSIONS };

export function deactivate(): void {
  // cleanup
}
