import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditHistory, createManagedPathResolver, getHistoryFilePath } from './edit-history';

describe('EditHistory', () => {
  let rootDir: string;
  let history: EditHistory;

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), 'desktalk-edit-history-'));
    history = new EditHistory(createManagedPathResolver([rootDir]));
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it('records edits and supports undo/redo', async () => {
    const filePath = join(rootDir, 'report.html');

    history.recordEdit(filePath, '<h1>Q1</h1>', '<h1>Q2</h1>');

    expect(history.undo(filePath)).toBe('<h1>Q1</h1>');
    expect(history.redo(filePath)).toBe('<h1>Q2</h1>');

    const rawHistory = await readFile(getHistoryFilePath(filePath), 'utf8');
    expect(rawHistory).toContain('"content":"<h1>Q1</h1>"');
    expect(rawHistory).toContain('"content":"<h1>Q2</h1>"');
    expect(rawHistory).toContain('"pointer":2');
  });

  it('discards redo history when a new edit is recorded after undo', () => {
    const filePath = join(rootDir, 'report.html');

    history.recordEdit(filePath, 'one', 'two');
    history.recordEdit(filePath, 'two', 'three');

    expect(history.undo(filePath)).toBe('two');
    history.recordEdit(filePath, 'two', 'two revised');

    expect(history.redo(filePath)).toBeNull();
    expect(history.undo(filePath)).toBe('two');
    expect(history.undo(filePath)).toBe('one');
  });

  it('resolves relative paths inside the managed root', () => {
    history.recordEdit('nested/report.html', 'before', 'after');

    expect(history.undo('nested/report.html')).toBe('before');
  });

  it('rejects paths outside the managed root', () => {
    expect(() => history.recordEdit('../escape.html', 'before', 'after')).toThrow(
      'outside managed directories',
    );
  });
});
