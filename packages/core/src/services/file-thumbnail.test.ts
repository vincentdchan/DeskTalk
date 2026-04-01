import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  THUMBNAIL_SIZES,
  DEFAULT_THUMBNAIL_SIZE,
  THUMBNAIL_CACHE_CONTROL,
  isThumbnailSize,
  parseThumbnailSize,
  isImageFile,
  getThumbnailCachePath,
  ensureCacheDir,
  generateThumbnail,
  getThumbnailOrOriginal,
} from './file-thumbnail';

describe('file-thumbnail', () => {
  describe('constants', () => {
    it('exports supported thumbnail sizes', () => {
      expect(THUMBNAIL_SIZES).toEqual([64, 96, 128]);
    });

    it('exports default thumbnail size', () => {
      expect(DEFAULT_THUMBNAIL_SIZE).toBe(96);
    });

    it('exports cache control header value', () => {
      expect(THUMBNAIL_CACHE_CONTROL).toBe('public, max-age=86400, stale-while-revalidate=604800');
    });
  });

  describe('isThumbnailSize', () => {
    it('returns true for supported sizes', () => {
      expect(isThumbnailSize(64)).toBe(true);
      expect(isThumbnailSize(96)).toBe(true);
      expect(isThumbnailSize(128)).toBe(true);
    });

    it('returns false for unsupported sizes', () => {
      expect(isThumbnailSize(32)).toBe(false);
      expect(isThumbnailSize(100)).toBe(false);
      expect(isThumbnailSize(256)).toBe(false);
    });
  });

  describe('parseThumbnailSize', () => {
    it('parses supported size strings', () => {
      expect(parseThumbnailSize('64')).toBe(64);
      expect(parseThumbnailSize('96')).toBe(96);
      expect(parseThumbnailSize('128')).toBe(128);
    });

    it('returns undefined for undefined input', () => {
      expect(parseThumbnailSize(undefined)).toBeUndefined();
    });

    it('returns undefined for empty string', () => {
      expect(parseThumbnailSize('')).toBeUndefined();
    });

    it('returns undefined for non-numeric strings', () => {
      expect(parseThumbnailSize('abc')).toBeUndefined();
      expect(parseThumbnailSize('96px')).toBeUndefined();
    });

    it('returns undefined for unsupported sizes', () => {
      expect(parseThumbnailSize('32')).toBeUndefined();
      expect(parseThumbnailSize('256')).toBeUndefined();
      expect(parseThumbnailSize('100')).toBeUndefined();
    });

    it('returns undefined for non-string values', () => {
      expect(parseThumbnailSize(96)).toBeUndefined();
      expect(parseThumbnailSize(null)).toBeUndefined();
      expect(parseThumbnailSize({})).toBeUndefined();
    });
  });

  describe('isImageFile', () => {
    it('returns true for supported image extensions', () => {
      expect(isImageFile('image.png')).toBe(true);
      expect(isImageFile('image.jpg')).toBe(true);
      expect(isImageFile('image.jpeg')).toBe(true);
      expect(isImageFile('image.webp')).toBe(true);
      expect(isImageFile('image.gif')).toBe(true);
      expect(isImageFile('image.bmp')).toBe(true);
    });

    it('returns true for uppercase extensions', () => {
      expect(isImageFile('image.PNG')).toBe(true);
      expect(isImageFile('image.JPG')).toBe(true);
    });

    it('returns false for non-image files', () => {
      expect(isImageFile('document.txt')).toBe(false);
      expect(isImageFile('script.js')).toBe(false);
      expect(isImageFile('data.json')).toBe(false);
      expect(isImageFile('archive.zip')).toBe(false);
    });

    it('returns false for files without extensions', () => {
      expect(isImageFile('README')).toBe(false);
      expect(isImageFile('Makefile')).toBe(false);
    });
  });

  describe('getThumbnailCachePath', () => {
    it('generates consistent cache paths', () => {
      const cacheDir = '/cache';
      const filePath = '/home/user/image.png';
      const mtime = 1234567890;
      const size = 96;

      const path1 = getThumbnailCachePath(cacheDir, filePath, mtime, size);
      const path2 = getThumbnailCachePath(cacheDir, filePath, mtime, size);

      expect(path1).toBe(path2);
      expect(path1).toContain(cacheDir);
      expect(path1).toContain('96.png');
    });

    it('generates different paths for different parameters', () => {
      const cacheDir = '/cache';
      const filePath = '/home/user/image.png';
      const mtime = 1234567890;

      const path1 = getThumbnailCachePath(cacheDir, filePath, mtime, 64);
      const path2 = getThumbnailCachePath(cacheDir, filePath, mtime, 96);
      const path3 = getThumbnailCachePath(cacheDir, filePath, mtime + 1, 96);

      expect(path1).not.toBe(path2);
      expect(path2).not.toBe(path3);
    });
  });

  describe('ensureCacheDir', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = join(tmpdir(), `thumbnail-test-${Date.now()}`);
    });

    afterEach(() => {
      try {
        if (existsSync(tempDir)) {
          rmSync(tempDir, { recursive: true, force: true });
        }
      } catch {
        // Ignore cleanup errors
      }
    });

    it('creates directory if it does not exist', () => {
      const cacheDir = join(tempDir, 'cache');
      expect(existsSync(cacheDir)).toBe(false);

      ensureCacheDir(cacheDir);

      expect(existsSync(cacheDir)).toBe(true);
    });

    it('does not throw if directory already exists', () => {
      const cacheDir = join(tempDir, 'cache');
      mkdirSync(cacheDir, { recursive: true });

      expect(() => ensureCacheDir(cacheDir)).not.toThrow();
    });
  });

  describe('generateThumbnail', () => {
    let tempDir: string;
    let cacheDir: string;
    let imagePath: string;

    beforeEach(async () => {
      tempDir = join(tmpdir(), `thumbnail-test-${Date.now()}`);
      cacheDir = join(tempDir, 'cache');
      imagePath = join(tempDir, 'test.png');

      mkdirSync(tempDir, { recursive: true });

      // Create a simple 100x100 red PNG using sharp
      const sharp = (await import('sharp')).default;
      await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 3,
          background: { r: 255, g: 0, b: 0 },
        },
      })
        .png()
        .toFile(imagePath);
    });

    afterEach(() => {
      try {
        if (existsSync(tempDir)) {
          rmSync(tempDir, { recursive: true, force: true });
        }
      } catch {
        // Ignore cleanup errors
      }
    });

    it('generates a thumbnail for an image file', async () => {
      const result = await generateThumbnail(imagePath, cacheDir, 64);

      expect(result.data).toBeInstanceOf(Buffer);
      expect(result.fromCache).toBe(false);
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('caches thumbnail and returns from cache on second call', async () => {
      // First call generates thumbnail
      const result1 = await generateThumbnail(imagePath, cacheDir, 64);
      expect(result1.fromCache).toBe(false);

      // Second call should return from cache
      const result2 = await generateThumbnail(imagePath, cacheDir, 64);
      expect(result2.fromCache).toBe(true);
      expect(result2.data).toEqual(result1.data);
    });

    it('generates different sizes correctly', async () => {
      const result64 = await generateThumbnail(imagePath, cacheDir, 64);
      const result128 = await generateThumbnail(imagePath, cacheDir, 128);

      expect(result64.fromCache).toBe(false);
      expect(result128.fromCache).toBe(false);
      expect(result64.data).not.toEqual(result128.data);
    });

    it('invalidates cache when file is modified', async () => {
      // Generate initial thumbnail
      const result1 = await generateThumbnail(imagePath, cacheDir, 64);
      expect(result1.fromCache).toBe(false);

      // Modify the file
      await new Promise((resolve) => setTimeout(resolve, 10));
      writeFileSync(imagePath, result1.data);

      // Should regenerate thumbnail (not from cache)
      const result2 = await generateThumbnail(imagePath, cacheDir, 64);
      expect(result2.fromCache).toBe(false);
    });
  });

  describe('getThumbnailOrOriginal', () => {
    let tempDir: string;
    let cacheDir: string;
    let imagePath: string;
    let textPath: string;

    beforeEach(async () => {
      tempDir = join(tmpdir(), `thumbnail-test-${Date.now()}`);
      cacheDir = join(tempDir, 'cache');
      imagePath = join(tempDir, 'test.png');
      textPath = join(tempDir, 'test.txt');

      mkdirSync(tempDir, { recursive: true });

      // Create a simple image
      const sharp = (await import('sharp')).default;
      await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 3,
          background: { r: 255, g: 0, b: 0 },
        },
      })
        .png()
        .toFile(imagePath);

      // Create a text file
      writeFileSync(textPath, 'Hello World');
    });

    afterEach(() => {
      try {
        if (existsSync(tempDir)) {
          rmSync(tempDir, { recursive: true, force: true });
        }
      } catch {
        // Ignore cleanup errors
      }
    });

    it('generates thumbnail for image files', async () => {
      const result = await getThumbnailOrOriginal(imagePath, cacheDir, 64);

      expect(result.data).toBeInstanceOf(Buffer);
      expect(result.contentType).toBe('image/png');
    });

    it('returns stream for non-image files', async () => {
      const result = await getThumbnailOrOriginal(textPath, cacheDir, 64);

      expect(result.contentType).toBe('application/octet-stream');
      const stream = result.data as NodeJS.ReadableStream;
      expect(typeof stream.pipe).toBe('function');

      await new Promise<void>((resolve, reject) => {
        stream.on('error', reject);
        stream.on('end', resolve);
        stream.resume();
      });
    });
  });
});
