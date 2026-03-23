import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LiveAppStorage } from './bridge-storage';

describe('bridge storage', () => {
  let rootDir: string;
  let homeDir: string;
  let storage: LiveAppStorage;

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), 'desktalk-preview-storage-'));
    homeDir = join(rootDir, 'home', 'alice');
    storage = new LiveAppStorage(homeDir);
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it('stores and retrieves kv values', async () => {
    await expect(
      storage.execute('demo_stream-1', { action: 'kv.get', name: 'settings' }),
    ).resolves.toEqual({ value: undefined });

    await expect(
      storage.execute('demo_stream-1', {
        action: 'kv.set',
        name: 'settings',
        value: { theme: 'kanban', columns: 3 },
      }),
    ).resolves.toEqual({ ok: true });

    await expect(
      storage.get<{ theme: string; columns: number }>('demo_stream-1', 'settings'),
    ).resolves.toEqual({ theme: 'kanban', columns: 3 });

    await expect(storage.list('demo_stream-1')).resolves.toEqual(['settings']);
  });

  it('persists collection ops in jsonl and supports queries', async () => {
    await storage.execute('tracker_stream-2', {
      action: 'collection.insert',
      collection: 'tasks',
      params: { id: 'a1', title: 'Buy milk', status: 'todo', createdAt: 1 },
    });
    await storage.execute('tracker_stream-2', {
      action: 'collection.insert',
      collection: 'tasks',
      params: { id: 'a2', title: 'Ship docs', status: 'done', createdAt: 2 },
    });
    await storage.execute('tracker_stream-2', {
      action: 'collection.update',
      collection: 'tasks',
      id: 'a1',
      params: { status: 'done' },
    });

    await expect(
      storage.execute('tracker_stream-2', {
        action: 'collection.findById',
        collection: 'tasks',
        id: 'a1',
      }),
    ).resolves.toEqual({
      record: { id: 'a1', title: 'Buy milk', status: 'done', createdAt: 1 },
    });

    await expect(
      storage.execute('tracker_stream-2', {
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
      storage.execute('tracker_stream-2', {
        action: 'collection.count',
        collection: 'tasks',
        filter: { status: 'done' },
      }),
    ).resolves.toEqual({ count: 2 });

    const jsonlPath = join(homeDir, '.storage', 'liveapps', 'tracker_stream-2', 'tasks.jsonl');
    await expect(readFile(jsonlPath, 'utf8')).resolves.toContain('"op":"update"');
  });

  it('compacts collections to insert-only snapshots', async () => {
    await storage.execute('tracker_stream-3', {
      action: 'collection.insert',
      collection: 'tasks',
      params: { id: 'a1', title: 'Buy milk', status: 'todo' },
    });
    await storage.execute('tracker_stream-3', {
      action: 'collection.update',
      collection: 'tasks',
      id: 'a1',
      params: { status: 'done' },
    });
    await storage.execute('tracker_stream-3', {
      action: 'collection.insert',
      collection: 'tasks',
      params: { id: 'a2', title: 'Archive notes', status: 'todo' },
    });
    await storage.execute('tracker_stream-3', {
      action: 'collection.delete',
      collection: 'tasks',
      id: 'a2',
    });

    await expect(
      storage.execute('tracker_stream-3', {
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
      storage.execute('tracker_stream-3', {
        action: 'collection.findAll',
        collection: 'tasks',
      }),
    ).resolves.toEqual({
      records: [{ id: 'a1', title: 'Buy milk', status: 'done' }],
    });
  });
});
