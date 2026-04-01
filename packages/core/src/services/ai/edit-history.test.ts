import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditHistory, createManagedPathResolver } from './edit-history';

describe('EditHistory', () => {
  let rootDir: string;
  let history: EditHistory;
  let liveAppFilePath: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), 'desktalk-edit-history-'));
    history = new EditHistory(createManagedPathResolver([rootDir]));
    liveAppFilePath = join(rootDir, '.data', 'liveapps', 'demo-app', 'index.html');
    await mkdir(join(rootDir, '.data', 'liveapps', 'demo-app'), { recursive: true });
    await writeFile(liveAppFilePath, '<h1>Q1</h1>', 'utf8');
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it('records liveapp edits and supports undo/redo', async () => {
    await history.recordEdit(liveAppFilePath, '<h1>Q1</h1>', '<h1>Q2</h1>');

    expect(await history.undo(liveAppFilePath)).toBe('<h1>Q1</h1>');
    expect(await history.redo(liveAppFilePath)).toBe('<h1>Q2</h1>');
    await expect(readFile(liveAppFilePath, 'utf8')).resolves.toBe('<h1>Q2</h1>');
    expect(existsSync(join(rootDir, '.data', 'liveapps', 'demo-app', '.git'))).toBe(true);
  });

  it('discards redo history when a new edit is recorded after undo', async () => {
    await history.recordEdit(liveAppFilePath, '<h1>Q1</h1>', '<h1>Q2</h1>');
    await writeFile(liveAppFilePath, '<h1>Q3</h1>', 'utf8');
    await history.recordEdit(liveAppFilePath, '<h1>Q2</h1>', '<h1>Q3</h1>');

    expect(await history.undo(liveAppFilePath)).toBe('<h1>Q2</h1>');
    await writeFile(liveAppFilePath, '<h1>Q2 revised</h1>', 'utf8');
    await history.recordEdit(liveAppFilePath, '<h1>Q2</h1>', '<h1>Q2 revised</h1>');

    expect(await history.redo(liveAppFilePath)).toBeNull();
    expect(await history.undo(liveAppFilePath)).toBe('<h1>Q2</h1>');
    expect(await history.undo(liveAppFilePath)).toBe('<h1>Q1</h1>');
  });

  it('resolves relative paths inside the managed root', async () => {
    const relativePath = '.data/liveapps/demo-app/index.html';

    await history.recordEdit(relativePath, '<h1>Q1</h1>', '<h1>Q2</h1>');

    expect(await history.undo(relativePath)).toBe('<h1>Q1</h1>');
  });

  it('rejects paths outside the managed root', async () => {
    await expect(history.recordEdit('../escape.html', 'before', 'after')).rejects.toThrow(
      'outside managed directories',
    );
  });

  it('returns null for non-liveapp files', async () => {
    const plainFilePath = join(rootDir, 'notes.txt');
    await writeFile(plainFilePath, 'before', 'utf8');

    await history.recordEdit(plainFilePath, 'before', 'after');

    expect(await history.undo(plainFilePath)).toBeNull();
    expect(await history.redo(plainFilePath)).toBeNull();
  });
});
