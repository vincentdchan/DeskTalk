import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getStreamedAbsolutePath,
  getLegacyStreamedAbsolutePath,
  getLegacyStreamedRelativePath,
  getStreamedDirectoryName,
  getStreamedFileName,
  getStreamedRelativePath,
  isSupported,
  loadStreamedHtml,
  parseImageDimensions,
  saveStreamedHtml,
  sanitizeTitleSegment,
} from './backend-helpers';

const ONE_BY_ONE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yF9kAAAAASUVORK5CYII=';

describe('backend helpers', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'desktalk-preview-data-'));
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it('sanitizes streamed html filenames consistently', () => {
    expect(sanitizeTitleSegment('  Revenue Report: Q1/Q2  ')).toBe('revenue-report-q1q2');
    expect(getStreamedDirectoryName('stream-42', '  Revenue Report: Q1/Q2  ')).toBe(
      'revenue-report-q1q2_stream-42',
    );
    expect(getStreamedFileName()).toBe('index.html');
    expect(getStreamedRelativePath('stream-42', '  Revenue Report: Q1/Q2  ')).toBe(
      'streamed/revenue-report-q1q2_stream-42/index.html',
    );
  });

  it('saves and reloads streamed html snapshots', async () => {
    const snapshot = await saveStreamedHtml(
      dataDir,
      'stream-7',
      'Dashboard Demo',
      '<html>ok</html>',
    );

    expect(snapshot).toEqual({
      name: 'index.html',
      path: 'streamed/dashboard-demo_stream-7/index.html',
      content: '<html>ok</html>',
    });

    const absolutePath = getStreamedAbsolutePath(dataDir, 'stream-7', 'Dashboard Demo');
    await expect(readFile(absolutePath, 'utf8')).resolves.toBe('<html>ok</html>');
    await expect(loadStreamedHtml(dataDir, 'stream-7', 'Dashboard Demo')).resolves.toEqual(
      snapshot,
    );
  });

  it('returns null when a streamed html snapshot is missing', async () => {
    await expect(loadStreamedHtml(dataDir, 'stream-missing', 'Nope')).resolves.toBeNull();
  });

  it('loads legacy streamed html snapshots for backward compatibility', async () => {
    await mkdir(join(dataDir, 'streamed'), { recursive: true });
    const legacyPath = getLegacyStreamedAbsolutePath(dataDir, 'stream-9', 'Legacy Demo');
    await writeFile(legacyPath, '<html>legacy</html>', 'utf8');

    await expect(loadStreamedHtml(dataDir, 'stream-9', 'Legacy Demo')).resolves.toEqual({
      name: 'stream-9-legacy-demo.html',
      path: getLegacyStreamedRelativePath('stream-9', 'Legacy Demo'),
      content: '<html>legacy</html>',
    });
  });

  it('detects supported image extensions and png dimensions', () => {
    expect(isSupported('cat.png')).toBe(true);
    expect(isSupported('diagram.webp')).toBe(true);
    expect(isSupported('notes.html')).toBe(false);
    expect(parseImageDimensions(ONE_BY_ONE_PNG_BASE64, 'image/png')).toEqual({
      width: 1,
      height: 1,
    });
  });
});
