import type { FastifyInstance } from 'fastify';
import { lstatSync, realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { getUserHomeDir } from '../services/workspace';
import {
  DEFAULT_THUMBNAIL_SIZE,
  generateThumbnail,
  isImageFile,
  parseThumbnailSize,
  THUMBNAIL_CACHE_CONTROL,
  THUMBNAIL_SIZES,
} from '../services/file-thumbnail';

function normalizeRelativePath(rawPath: string): string {
  return rawPath.replace(/\\/g, '/');
}

function resolveUserFile(userHomeDir: string, relativePath: string): string {
  const normalized = normalizeRelativePath(relativePath).replace(/^\/+/, '');
  const resolvedPath = resolve(userHomeDir, normalized);
  const homePrefix = `${resolve(userHomeDir)}${sep}`;
  if (resolvedPath !== resolve(userHomeDir) && !resolvedPath.startsWith(homePrefix)) {
    throw new Error('Path escapes the user home directory.');
  }
  return resolvedPath;
}

function hasDisallowedHiddenSegment(relativePath: string): boolean {
  const segments = normalizeRelativePath(relativePath).split('/').filter(Boolean);
  return segments.some((segment) => segment.startsWith('.'));
}

export async function thumbnailRoutes(app: FastifyInstance): Promise<void> {
  app.get<{
    Querystring: { path?: string; size?: string };
  }>('/api/files/thumbnail', async (req, reply) => {
    const rawPath = req.query.path;
    if (!rawPath) {
      reply.code(400);
      return { error: 'Missing path parameter' };
    }

    const relativePath = normalizeRelativePath(decodeURIComponent(rawPath));
    if (!relativePath || relativePath.split('/').some((segment) => segment === '..')) {
      reply.code(400);
      return { error: 'Invalid file path' };
    }

    if (hasDisallowedHiddenSegment(relativePath)) {
      reply.code(403);
      return { error: 'Access denied' };
    }

    const userHomeDir = getUserHomeDir(req.user!.username);
    const absolutePath = resolveUserFile(userHomeDir, relativePath);

    let stats;
    try {
      stats = lstatSync(absolutePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        reply.code(404);
        return { error: 'Not found' };
      }
      throw error;
    }

    if (!stats.isFile() || stats.isSymbolicLink()) {
      reply.code(403);
      return { error: 'Access denied' };
    }

    // Validate symlink doesn't escape home
    const realFilePath = realpathSync(absolutePath);
    const realHomeDir = realpathSync(userHomeDir);
    const realHomePrefix = `${realHomeDir}${sep}`;
    if (realFilePath !== realHomeDir && !realFilePath.startsWith(realHomePrefix)) {
      reply.code(403);
      return { error: 'Access denied' };
    }

    // Parse thumbnail size
    const size = parseThumbnailSize(req.query.size) ?? DEFAULT_THUMBNAIL_SIZE;
    if (req.query.size !== undefined && !parseThumbnailSize(req.query.size)) {
      reply.code(400);
      return {
        error: `Invalid thumbnail size. Supported sizes: ${THUMBNAIL_SIZES.join(', ')}`,
      };
    }

    // Check if file is an image
    if (!isImageFile(absolutePath)) {
      reply.code(404);
      return { error: 'Not an image file' };
    }

    // Generate and serve thumbnail
    const cacheDir = resolve(userHomeDir, '.cache', 'file-explorer', 'thumbs');

    try {
      const { data, fromCache } = await generateThumbnail(realFilePath, cacheDir, size);

      reply.header('Cache-Control', THUMBNAIL_CACHE_CONTROL);
      reply.type('image/png');

      // Add cache status header for debugging
      if (fromCache) {
        reply.header('X-Thumbnail-Source', 'cache');
      } else {
        reply.header('X-Thumbnail-Source', 'generated');
      }

      return reply.send(data);
    } catch (error) {
      console.error('Failed to generate thumbnail:', error);
      reply.code(500);
      return { error: 'Failed to generate thumbnail' };
    }
  });
}
