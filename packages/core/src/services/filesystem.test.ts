import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createFileSystemHook } from './filesystem';

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'desktalk-fs-test-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('createFileSystemHook', () => {
  it('reads relative paths from the user home root', async () => {
    writeFileSync(join(tempDir, 'example.png'), 'home-file', 'utf8');

    const fs = createFileSystemHook(tempDir);

    await expect(fs.readFile('example.png')).resolves.toBe('home-file');
  });

  it('still allows access to MiniApp-private files under .data/<id>', async () => {
    mkdirSync(join(tempDir, '.data', 'file-explorer'), { recursive: true });
    writeFileSync(join(tempDir, '.data', 'file-explorer', 'welcome.md'), 'hello', 'utf8');

    const fs = createFileSystemHook(tempDir);

    await expect(fs.readFile('.data/file-explorer/welcome.md')).resolves.toBe('hello');
  });

  it('rejects path traversal outside the home root', async () => {
    const fs = createFileSystemHook(tempDir);

    await expect(fs.readFile('../outside.txt')).rejects.toThrow('Path traversal not allowed');
  });
});
