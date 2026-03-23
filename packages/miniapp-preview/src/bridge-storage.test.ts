import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { executeStorageAction } from './bridge-storage';

describe('bridge storage', () => {
  let rootDir: string;
  let homeDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), 'desktalk-preview-storage-'));
    homeDir = join(rootDir, 'home', 'alice');
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it('stores and retrieves kv values', async () => {
    await expect(
      executeStorageAction(homeDir, 'demo_stream-1', { action: 'kv.get', name: 'settings' }),
    ).resolves.toEqual({ value: undefined });

    await expect(
      executeStorageAction(homeDir, 'demo_stream-1', {
        action: 'kv.set',
        name: 'settings',
        value: { theme: 'kanban', columns: 3 },
      }),
    ).resolves.toEqual({ ok: true });

    await expect(
      executeStorageAction(homeDir, 'demo_stream-1', { action: 'kv.get', name: 'settings' }),
    ).resolves.toEqual({ value: { theme: 'kanban', columns: 3 } });

    await expect(
      executeStorageAction(homeDir, 'demo_stream-1', { action: 'kv.list' }),
    ).resolves.toEqual({ names: ['settings'] });
  });

  it('persists collection ops in jsonl and supports queries', async () => {
    await executeStorageAction(homeDir, 'tracker_stream-2', {
      action: 'collection.insert',
      collection: 'tasks',
      params: { id: 'a1', title: 'Buy milk', status: 'todo', createdAt: 1 },
    });
    await executeStorageAction(homeDir, 'tracker_stream-2', {
      action: 'collection.insert',
      collection: 'tasks',
      params: { id: 'a2', title: 'Ship docs', status: 'done', createdAt: 2 },
    });
    await executeStorageAction(homeDir, 'tracker_stream-2', {
      action: 'collection.update',
      collection: 'tasks',
      id: 'a1',
      params: { status: 'done' },
    });

    await expect(
      executeStorageAction(homeDir, 'tracker_stream-2', {
        action: 'collection.findById',
        collection: 'tasks',
        id: 'a1',
      }),
    ).resolves.toEqual({
      record: { id: 'a1', title: 'Buy milk', status: 'done', createdAt: 1 },
    });

    await expect(
      executeStorageAction(homeDir, 'tracker_stream-2', {
        action: 'collection.find',
        collection: 'tasks',
        filter: { status: 'done' },
        options: { sort: 'createdAt', order: 'desc' },
      }),
    ).resolves.toEqual({
      records: [
        { id: 'a2', title: 'Ship docs', status: 'done', createdAt: 2 },
        { id: 'a1', title: 'Buy milk', status: 'done', createdAt: 1 },
      ],
    });

    await expect(
      executeStorageAction(homeDir, 'tracker_stream-2', {
        action: 'collection.count',
        collection: 'tasks',
        filter: { status: 'done' },
      }),
    ).resolves.toEqual({ count: 2 });

    const jsonlPath = join(homeDir, '.storage', 'liveapps', 'tracker_stream-2', 'tasks.jsonl');
    await expect(readFile(jsonlPath, 'utf8')).resolves.toContain('"op":"update"');
  });

  it('compacts collections to insert-only snapshots', async () => {
    await executeStorageAction(homeDir, 'tracker_stream-3', {
      action: 'collection.insert',
      collection: 'tasks',
      params: { id: 'a1', title: 'Buy milk', status: 'todo' },
    });
    await executeStorageAction(homeDir, 'tracker_stream-3', {
      action: 'collection.update',
      collection: 'tasks',
      id: 'a1',
      params: { status: 'done' },
    });
    await executeStorageAction(homeDir, 'tracker_stream-3', {
      action: 'collection.insert',
      collection: 'tasks',
      params: { id: 'a2', title: 'Archive notes', status: 'todo' },
    });
    await executeStorageAction(homeDir, 'tracker_stream-3', {
      action: 'collection.delete',
      collection: 'tasks',
      id: 'a2',
    });

    await expect(
      executeStorageAction(homeDir, 'tracker_stream-3', {
        action: 'collection.compact',
        collection: 'tasks',
      }),
    ).resolves.toEqual({ ok: true });

    const jsonlPath = join(homeDir, '.storage', 'liveapps', 'tracker_stream-3', 'tasks.jsonl');
    const content = await readFile(jsonlPath, 'utf8');

    expect(content).toContain('"op":"insert"');
    expect(content).not.toContain('"op":"update"');
    expect(content).not.toContain('"op":"delete"');

    await expect(
      executeStorageAction(homeDir, 'tracker_stream-3', {
        action: 'collection.findAll',
        collection: 'tasks',
      }),
    ).resolves.toEqual({
      records: [{ id: 'a1', title: 'Buy milk', status: 'done' }],
    });
  });
});
