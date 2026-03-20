import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getStreamedAbsolutePath,
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
    expect(getStreamedFileName('stream-42', '  Revenue Report: Q1/Q2  ')).toBe(
      'stream-42-revenue-report-q1q2.html',
    );
    expect(getStreamedRelativePath('stream-42', '  Revenue Report: Q1/Q2  ')).toBe(
      'streamed/stream-42-revenue-report-q1q2.html',
    );
  });

  it('saves and reloads streamed html snapshots', async () => {
    await mkdir(join(dataDir, 'streamed'), { recursive: true });
    const snapshot = await saveStreamedHtml(
      dataDir,
      'stream-7',
      'Dashboard Demo',
      '<html>ok</html>',
    );

    expect(snapshot).toEqual({
      name: 'stream-7-dashboard-demo.html',
      path: 'streamed/stream-7-dashboard-demo.html',
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
