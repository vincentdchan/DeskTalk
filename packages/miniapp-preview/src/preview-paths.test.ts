import { describe, expect, it } from 'vitest';
import { isLiveAppPath, matchesPreviewFilePath, normalizePreviewPath } from './preview-paths';

describe('preview paths', () => {
  it('normalizes windows separators', () => {
    expect(normalizePreviewPath('.data\\liveapps\\demo\\index.html')).toBe(
      '.data/liveapps/demo/index.html',
    );
  });

  it('detects relative liveapp paths', () => {
    expect(isLiveAppPath('.data/liveapps/system-monitor_html-stream-1/index.html')).toBe(true);
  });

  it('does not treat other relative paths as liveapps', () => {
    expect(isLiveAppPath('.data/preview/snapshot.html')).toBe(false);
    expect(isLiveAppPath('documents/report.html')).toBe(false);
  });

  it('matches relative paths against absolute saved file paths', () => {
    expect(
      matchesPreviewFilePath(
        '/tmp/desktalk/home/alice/.data/liveapps/system-monitor_html-stream-1/index.html',
        '.data/liveapps/system-monitor_html-stream-1/index.html',
      ),
    ).toBe(true);
  });
});
