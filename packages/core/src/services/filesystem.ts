import {
  readFileSync,
  writeFileSync,
  unlinkSync,
  readdirSync,
  mkdirSync,
  statSync,
  existsSync,
} from 'node:fs';
import { join, resolve, relative } from 'node:path';
import type { FileSystemHook, FileEntry, FileStat } from '@desktalk/sdk';

/**
 * Creates a scoped filesystem hook for a MiniApp.
 * All paths are resolved relative to the MiniApp's data directory.
 * Path traversal outside the root is prevented.
 */
export function createFileSystemHook(rootDir: string): FileSystemHook {
  /**
   * Resolve a relative path to an absolute path within the root.
   * Throws if the resolved path escapes the root directory.
   */
  function safePath(relPath: string): string {
    const resolved = resolve(rootDir, relPath);
    const rel = relative(rootDir, resolved);
    if (rel.startsWith('..') || resolve(rootDir, rel) !== resolved) {
      throw new Error(`Path traversal not allowed: ${relPath}`);
    }
    return resolved;
  }

  return {
    async readFile(path: string): Promise<string> {
      const abs = safePath(path);
      return readFileSync(abs, 'utf-8');
    },

    async readFileBase64(path: string): Promise<string> {
      const abs = safePath(path);
      return readFileSync(abs).toString('base64');
    },

    async writeFile(path: string, content: string): Promise<void> {
      const abs = safePath(path);
      // Ensure parent directory exists
      const parent = resolve(abs, '..');
      if (!existsSync(parent)) {
        mkdirSync(parent, { recursive: true });
      }
      writeFileSync(abs, content, 'utf-8');
    },

    async writeFileBase64(path: string, contentBase64: string): Promise<void> {
      const abs = safePath(path);
      const parent = resolve(abs, '..');
      if (!existsSync(parent)) {
        mkdirSync(parent, { recursive: true });
      }
      writeFileSync(abs, Buffer.from(contentBase64, 'base64'));
    },

    async deleteFile(path: string): Promise<void> {
      const abs = safePath(path);
      unlinkSync(abs);
    },

    async readDir(path: string): Promise<FileEntry[]> {
      const abs = safePath(path);
      const entries = readdirSync(abs, { withFileTypes: true });
      return entries.map((entry) => ({
        name: entry.name,
        path: join(path, entry.name),
        type: entry.isDirectory() ? ('directory' as const) : ('file' as const),
      }));
    },

    async mkdir(path: string): Promise<void> {
      const abs = safePath(path);
      mkdirSync(abs, { recursive: true });
    },

    async stat(path: string): Promise<FileStat> {
      const abs = safePath(path);
      const s = statSync(abs);
      return {
        size: s.size,
        type: s.isDirectory() ? 'directory' : 'file',
        createdAt: s.birthtime.toISOString(),
        modifiedAt: s.mtime.toISOString(),
      };
    },

    async exists(path: string): Promise<boolean> {
      const abs = safePath(path);
      return existsSync(abs);
    },
  };
}
