import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { extractLiveAppTitle, listLiveApps } from './liveapps';

describe('liveapps', () => {
  it('extracts title from html', () => {
    expect(extractLiveAppTitle('<html><head><title>Project Tracker</title></head></html>')).toBe(
      'Project Tracker',
    );
  });

  it('decodes simple html entities in titles', () => {
    expect(extractLiveAppTitle('<title>Roadmap &amp; Notes</title>')).toBe('Roadmap & Notes');
  });

  it('lists liveapps from the user liveapps directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'desktalk-liveapps-'));

    try {
      const homeDir = join(root, 'home', 'alice');
      const liveAppsDir = join(homeDir, '.data', 'liveapps');
      mkdirSync(join(liveAppsDir, 'project-tracker_html-stream-1'), { recursive: true });
      mkdirSync(join(liveAppsDir, 'no-title_html-stream-2'), { recursive: true });
      writeFileSync(
        join(liveAppsDir, 'project-tracker_html-stream-1', 'index.html'),
        '<html><head><title>Project Tracker</title></head><body></body></html>',
        'utf8',
      );
      writeFileSync(
        join(liveAppsDir, 'no-title_html-stream-2', 'index.html'),
        '<html><head></head><body></body></html>',
        'utf8',
      );

      expect(listLiveApps(homeDir)).toEqual([
        {
          id: 'no-title_html-stream-2',
          name: 'no-title_html-stream-2',
          path: '.data/liveapps/no-title_html-stream-2/index.html',
          icon: '📄',
        },
        {
          id: 'project-tracker_html-stream-1',
          name: 'Project Tracker',
          path: '.data/liveapps/project-tracker_html-stream-1/index.html',
          icon: '📄',
        },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
