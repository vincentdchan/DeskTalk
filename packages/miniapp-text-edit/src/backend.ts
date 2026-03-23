import type { MiniAppManifest, MiniAppContext, MiniAppBackendActivation } from '@desktalk/sdk';
import type { TextEditFile, SaveResult } from './types';

// ─── Manifest ────────────────────────────────────────────────────────────────

export const manifest: MiniAppManifest = {
  id: 'text-edit',
  name: 'TextEdit',
  icon: '\u{1F4DD}',
  version: '0.1.0',
  description: 'Code and text editor powered by Monaco Editor',
  fileAssociations: {
    extensions: [
      '.md',
      '.markdown',
      '.txt',
      '.log',
      '.json',
      '.jsonc',
      '.ts',
      '.tsx',
      '.js',
      '.jsx',
      '.mjs',
      '.cjs',
      '.py',
      '.html',
      '.htm',
      '.css',
      '.scss',
      '.sass',
      '.yaml',
      '.yml',
      '.toml',
      '.sh',
      '.bash',
      '.zsh',
      '.xml',
      '.svg',
      '.sql',
      '.rs',
      '.go',
      '.java',
      '.c',
      '.h',
      '.cpp',
      '.hpp',
      '.cc',
      '.rb',
      '.csv',
      '.ini',
      '.cfg',
      '.env',
      '.gitignore',
      '.editorconfig',
    ],
  },
};

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum file size in bytes (5 MB). */
const MAX_FILE_SIZE = 5 * 1024 * 1024;

/** Number of bytes to sample for binary detection. */
const BINARY_CHECK_SIZE = 8192;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fileName(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx >= 0 ? path.slice(idx + 1) : path;
}

/**
 * Detect binary content by checking for null bytes in the first chunk.
 * A null byte (0x00) in the first 8 KB strongly indicates a binary file.
 */
function isBinaryContent(content: string): boolean {
  const sample = content.substring(0, BINARY_CHECK_SIZE);
  return sample.includes('\0');
}

// ─── Activate ────────────────────────────────────────────────────────────────

export function activate(ctx: MiniAppContext): MiniAppBackendActivation {
  ctx.logger.info('TextEdit MiniApp activated');

  // ─── textedit.open ─────────────────────────────────────────────────────

  ctx.messaging.onCommand<{ path: string }, TextEditFile>('textedit.open', async (req) => {
    const path = req.path;

    // Check file exists and get stat
    const stat = await ctx.fs.stat(path);

    if (stat.type !== 'file') {
      throw new Error(`Not a file: ${path}`);
    }

    if (stat.size > MAX_FILE_SIZE) {
      throw new Error(
        `File too large (${(stat.size / 1024 / 1024).toFixed(1)} MB). Maximum size is ${MAX_FILE_SIZE / 1024 / 1024} MB.`,
      );
    }

    const content = await ctx.fs.readFile(path);

    // Binary detection
    if (isBinaryContent(content)) {
      throw new Error('Binary file detected. TextEdit only supports UTF-8 text files.');
    }

    return {
      path,
      name: fileName(path),
      content,
      size: stat.size,
      modifiedAt: stat.modifiedAt,
    };
  });

  // ─── textedit.save ─────────────────────────────────────────────────────

  ctx.messaging.onCommand<{ path: string; content: string }, SaveResult>(
    'textedit.save',
    async (req) => {
      await ctx.fs.writeFile(req.path, req.content);
      const stat = await ctx.fs.stat(req.path);

      ctx.logger.info(`Saved file: ${req.path}`);
      return {
        success: true,
        updatedAt: stat.modifiedAt,
      };
    },
  );

  return {};
}

export function deactivate(): void {
  // cleanup
}
