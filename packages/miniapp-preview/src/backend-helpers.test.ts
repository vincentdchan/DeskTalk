import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getStreamedAbsolutePath,
  getLegacyStreamedAbsolutePath,
  getStreamedFileName,
  getStreamedRelativePath,
  isSupported,
  loadStreamedHtml,
  parseImageDimensions,
  saveStreamedHtml,
  stripDtInjections,
} from './backend-helpers';

const ONE_BY_ONE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yF9kAAAAASUVORK5CYII=';

describe('backend helpers', () => {
  let rootDir: string;
  let homeDir: string;
  let previewDataDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), 'desktalk-preview-data-'));
    homeDir = join(rootDir, 'home', 'alice');
    previewDataDir = join(homeDir, '.data', 'preview');
    await mkdir(previewDataDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it('builds streamed html paths consistently', () => {
    expect(getStreamedFileName()).toBe('index.html');
    expect(getStreamedRelativePath('stream-42', '  Revenue Report: Q1/Q2  ')).toBe(
      '.data/liveapps/revenue-report-q1q2_stream-42/index.html',
    );
  });

  it('saves and reloads liveapp html snapshots', async () => {
    const snapshot = await saveStreamedHtml(
      homeDir,
      'stream-7',
      'Dashboard Demo',
      '<html>ok</html>',
    );

    expect(snapshot).toEqual({
      name: 'index.html',
      path: getStreamedAbsolutePath(homeDir, 'stream-7', 'Dashboard Demo'),
      content: '<html>ok</html>',
    });

    const absolutePath = getStreamedAbsolutePath(homeDir, 'stream-7', 'Dashboard Demo');
    await expect(readFile(absolutePath, 'utf8')).resolves.toBe('<html>ok</html>');
    await expect(
      loadStreamedHtml(homeDir, 'stream-7', 'Dashboard Demo', previewDataDir),
    ).resolves.toEqual(snapshot);
    expect(existsSync(join(homeDir, '.data', 'liveapps', 'dashboard-demo_stream-7', '.git'))).toBe(
      true,
    );
  });

  it('strips injected DeskTalk runtime tags before saving', async () => {
    const injectedHtml = [
      '<!DOCTYPE html><html><head>',
      '<link rel="stylesheet" href="/api/ui/desktalk-theme.css?accent=%237c6ff7&theme=dark" data-dt-theme>',
      '<script data-dt-theme-sync>',
      'window.addEventListener("message", () => {});',
      '</script>',
      '<script src="/api/ui/desktalk-ui.js" data-dt-ui></script>',
      '<script data-dt-bridge>',
      'window.DeskTalk = {};',
      '</script>',
      '<!DOCTYPE html><html><head><title>Demo</title></head><body>ok</body></html>',
    ].join('\n');

    const cleanedHtml =
      '<!DOCTYPE html><html><head><title>Demo</title></head><body>ok</body></html>';

    expect(stripDtInjections(injectedHtml)).toBe(cleanedHtml);

    const snapshot = await saveStreamedHtml(homeDir, 'stream-8', 'Injected Demo', injectedHtml);
    const absolutePath = getStreamedAbsolutePath(homeDir, 'stream-8', 'Injected Demo');

    expect(snapshot.content).toBe(cleanedHtml);
    await expect(readFile(absolutePath, 'utf8')).resolves.toBe(cleanedHtml);
  });

  it('returns null when a streamed html snapshot is missing', async () => {
    await expect(
      loadStreamedHtml(homeDir, 'stream-missing', 'Nope', previewDataDir),
    ).resolves.toBeNull();
  });

  it('loads legacy streamed html snapshots for backward compatibility', async () => {
    await mkdir(join(previewDataDir, 'streamed'), { recursive: true });
    const legacyPath = getLegacyStreamedAbsolutePath(previewDataDir, 'stream-9', 'Legacy Demo');
    await writeFile(legacyPath, '<html>legacy</html>', 'utf8');

    await expect(
      loadStreamedHtml(homeDir, 'stream-9', 'Legacy Demo', previewDataDir),
    ).resolves.toEqual({
      name: 'stream-9-legacy-demo.html',
      path: getLegacyStreamedAbsolutePath(previewDataDir, 'stream-9', 'Legacy Demo'),
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
