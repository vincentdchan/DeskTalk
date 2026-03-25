import { describe, expect, it } from 'vitest';
import { injectDtRuntime } from './html-injections';

describe('html injections', () => {
  it('injects fresh DeskTalk runtime tags into html head', () => {
    const html = '<!DOCTYPE html><html><head><title>Demo</title></head><body>ok</body></html>';

    const injected = injectDtRuntime(html, {
      theme: { accentColor: '#123456', mode: 'light' },
      streamId: 'stream-22',
      bridgeToken: 'bridge-abc',
    });

    expect(injected).toContain('data-dt-theme');
    expect(injected).toContain('data-dt-theme-sync');
    expect(injected).toContain('accent=%23123456');
    expect(injected).toContain('theme=light');
    expect(injected).toContain('data-dt-ui');
    expect(injected).toContain('data-dt-bridge');
    expect(injected).toContain('const streamId = "stream-22";');
    expect(injected).toContain('const token = "bridge-abc";');
    expect(injected.indexOf('data-dt-theme')).toBeLessThan(injected.indexOf('<title>Demo</title>'));
  });

  it('replaces stale runtime tags before injecting fresh ones', () => {
    const html = [
      '<!DOCTYPE html><html><head>',
      '<link rel="stylesheet" href="/api/ui/desktalk-theme.css?accent=%23000000&theme=dark" data-dt-theme>',
      '<script data-dt-theme-sync>',
      'window.addEventListener("message", () => {});',
      '</script>',
      '<script src="/api/ui/desktalk-ui.js" data-dt-ui></script>',
      '<script data-dt-bridge>',
      'const streamId = "old-stream";',
      '</script>',
      '<title>Demo</title></head><body>ok</body></html>',
    ].join('\n');

    const injected = injectDtRuntime(html, {
      theme: { accentColor: '#abcdef', mode: 'dark' },
      streamId: 'stream-99',
      bridgeToken: 'bridge-next',
    });

    expect((injected.match(/data-dt-theme(?=[\s>])/g) ?? []).length).toBe(1);
    expect((injected.match(/data-dt-theme-sync/g) ?? []).length).toBe(1);
    expect((injected.match(/data-dt-ui/g) ?? []).length).toBe(1);
    expect((injected.match(/data-dt-bridge/g) ?? []).length).toBe(1);
    expect(injected).not.toContain('old-stream');
    expect(injected).toContain('const streamId = "stream-99";');
  });
});
