import { createReadStream, renameSync, mkdirSync, statSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

export const THUMBNAIL_SIZES = [64, 96, 128] as const;
export const DEFAULT_THUMBNAIL_SIZE = 96;
export const THUMBNAIL_CACHE_CONTROL = 'public, max-age=86400, stale-while-revalidate=604800';

export type ThumbnailSize = (typeof THUMBNAIL_SIZES)[number];

export function isThumbnailSize(size: number): size is ThumbnailSize {
  return (THUMBNAIL_SIZES as readonly number[]).includes(size);
}

export function parseThumbnailSize(value: unknown): ThumbnailSize | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    return undefined;
  }

  const trimmed = value.trim();
  // Ensure the entire string is a valid integer (no extra characters like '96px')
  if (!/^\d+$/.test(trimmed)) {
    return undefined;
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(parsed) || !isThumbnailSize(parsed)) {
    return undefined;
  }

  return parsed;
}

// Image extensions that can be thumbnailed
const SUPPORTED_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);

export function isImageFile(filePath: string): boolean {
  const ext = filePath.toLowerCase().slice(filePath.lastIndexOf('.'));
  return SUPPORTED_IMAGE_EXTENSIONS.has(ext);
}

function getCacheKey(filePath: string, mtime: number): string {
  return createHash('sha256').update(`${filePath}:${mtime}`).digest('hex');
}

export function getThumbnailCachePath(
  cacheDir: string,
  filePath: string,
  mtime: number,
  size: number,
): string {
  const key = getCacheKey(filePath, mtime);
  return join(cacheDir, `${key}_${size}.png`);
}

export function ensureCacheDir(cacheDir: string): void {
  try {
    mkdirSync(cacheDir, { recursive: true });
  } catch {
    // Directory might already exist, ignore
  }
}

export interface GenerateThumbnailResult {
  data: Buffer;
  fromCache: boolean;
}

export async function generateThumbnail(
  sourcePath: string,
  cacheDir: string,
  size: number,
): Promise<GenerateThumbnailResult> {
  // Ensure cache directory exists
  ensureCacheDir(cacheDir);

  // Get file stats for cache key
  const stats = statSync(sourcePath);
  const cachePath = getThumbnailCachePath(cacheDir, sourcePath, stats.mtimeMs, size);

  // Try to read from cache
  try {
    const cached = await readFile(cachePath);
    return { data: cached, fromCache: true };
  } catch {
    // Cache miss, generate thumbnail
  }

  // Generate thumbnail using sharp
  const image = await sharp(sourcePath)
    .resize({
      width: size,
      height: size,
      fit: 'cover',
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();

  // Write to cache
  try {
    mkdirSync(dirname(cachePath), { recursive: true });
    // Use a temporary file and rename for atomic writes
    const tempPath = `${cachePath}.tmp`;
    await writeFile(tempPath, image);
    renameSync(tempPath, cachePath);
  } catch (error) {
    // Cache write failure is not critical, just log
    console.warn('Failed to write thumbnail cache:', error);
  }

  return { data: image, fromCache: false };
}

export async function getThumbnailOrOriginal(
  sourcePath: string,
  cacheDir: string,
  size: number,
): Promise<{ data: Buffer | ReturnType<typeof createReadStream>; contentType: string }> {
  if (!isImageFile(sourcePath)) {
    return {
      data: createReadStream(sourcePath),
      contentType: 'application/octet-stream',
    };
  }

  const { data } = await generateThumbnail(sourcePath, cacheDir, size);
  return {
    data,
    contentType: 'image/png',
  };
}
