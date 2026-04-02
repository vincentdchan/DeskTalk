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
} from './thumbnail';

describe('thumbnail', () => {
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

    it('returns undefined for invalid inputs', () => {
      expect(parseThumbnailSize(undefined)).toBeUndefined();
      expect(parseThumbnailSize('')).toBeUndefined();
      expect(parseThumbnailSize('abc')).toBeUndefined();
      expect(parseThumbnailSize('96px')).toBeUndefined();
      expect(parseThumbnailSize('32')).toBeUndefined();
      expect(parseThumbnailSize(96)).toBeUndefined();
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

    it('returns false for non-image files', () => {
      expect(isImageFile('document.txt')).toBe(false);
      expect(isImageFile('README')).toBe(false);
    });
  });

  describe('getThumbnailCachePath', () => {
    it('generates stable cache paths', () => {
      const cacheDir = '/cache';
      const filePath = '/home/user/image.png';
      const mtime = 1234567890;

      const path1 = getThumbnailCachePath(cacheDir, filePath, mtime, 96);
      const path2 = getThumbnailCachePath(cacheDir, filePath, mtime, 96);

      expect(path1).toBe(path2);
      expect(path1).toContain(cacheDir);
      expect(path1).toContain('96.png');
    });
  });

  describe('ensureCacheDir', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = join(tmpdir(), `thumbnail-test-${Date.now()}`);
    });

    afterEach(() => {
      if (existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('creates directory if missing', () => {
      const cacheDir = join(tempDir, 'cache');
      ensureCacheDir(cacheDir);
      expect(existsSync(cacheDir)).toBe(true);
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
      if (existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('generates and caches thumbnails', async () => {
      const result1 = await generateThumbnail(imagePath, cacheDir, 64);
      const result2 = await generateThumbnail(imagePath, cacheDir, 64);

      expect(result1.data).toBeInstanceOf(Buffer);
      expect(result1.fromCache).toBe(false);
      expect(result2.fromCache).toBe(true);
      expect(result2.data).toEqual(result1.data);
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

      writeFileSync(textPath, 'Hello World');
    });

    afterEach(() => {
      if (existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('generates thumbnail for image files', async () => {
      const result = await getThumbnailOrOriginal(imagePath, cacheDir, 64);
      expect(result.data).toBeInstanceOf(Buffer);
      expect(result.contentType).toBe('image/png');
    });

    it('returns a stream for non-image files', async () => {
      const result = await getThumbnailOrOriginal(textPath, cacheDir, 64);
      expect(result.contentType).toBe('application/octet-stream');
      const stream = result.data as NodeJS.ReadableStream;
      expect(typeof stream.pipe).toBe('function');
    });
  });
});
