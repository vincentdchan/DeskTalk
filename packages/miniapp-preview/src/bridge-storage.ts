import { appendFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const STORAGE_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const LIVEAPP_ID_PATTERN = /^[a-z0-9._-]+$/;

type JsonObject = Record<string, unknown>;

interface StoragePaths {
  storageDir: string;
}

interface StorageOp {
  op: 'insert' | 'update' | 'delete';
  id: string;
  data?: JsonObject;
  ts: number;
}

export interface StorageQueryOptions {
  sort?: string;
  order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export type StorageAction =
  | { action: 'kv.get'; name: string }
  | { action: 'kv.set'; name: string; value: unknown }
  | { action: 'kv.delete'; name: string }
  | { action: 'kv.list' }
  | { action: 'collection.insert'; collection: string; params: JsonObject }
  | { action: 'collection.update'; collection: string; id: string; params: JsonObject }
  | { action: 'collection.delete'; collection: string; id: string }
  | { action: 'collection.findById'; collection: string; id: string }
  | {
      action: 'collection.find';
      collection: string;
      filter?: JsonObject;
      options?: StorageQueryOptions;
    }
  | { action: 'collection.findAll'; collection: string }
  | { action: 'collection.count'; collection: string; filter?: JsonObject }
  | { action: 'collection.compact'; collection: string };

export type StorageActionResult =
  | { value: unknown }
  | { ok: true }
  | { deleted: boolean }
  | { names: string[] }
  | { record: JsonObject | null }
  | { records: JsonObject[] }
  | { count: number };

function assertLiveAppId(liveAppId: string): void {
  if (!LIVEAPP_ID_PATTERN.test(liveAppId)) {
    throw new Error('Invalid LiveApp storage scope.');
  }
}

function assertStorageName(name: string, label: string): void {
  if (!STORAGE_NAME_PATTERN.test(name)) {
    throw new Error(`Invalid ${label}. Use lowercase letters, numbers, and hyphens only.`);
  }
}

function assertRecordId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error('Record id must be a non-empty string.');
  }
}

function assertJsonObject(value: unknown, label: string): asserts value is JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
}

function getStoragePaths(homeDir: string, liveAppId: string): StoragePaths {
  assertLiveAppId(liveAppId);
  return {
    storageDir: join(homeDir, '.storage', 'liveapps', liveAppId),
  };
}

function getKvFilePath(paths: StoragePaths, name: string): string {
  assertStorageName(name, 'storage key');
  return join(paths.storageDir, `${name}.json`);
}

function getCollectionFilePath(paths: StoragePaths, name: string): string {
  assertStorageName(name, 'collection name');
  return join(paths.storageDir, `${name}.jsonl`);
}

async function readJsonIfExists(path: string): Promise<unknown> {
  try {
    const content = await readFile(path, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

async function readJsonlIfExists(path: string): Promise<StorageOp[]> {
  try {
    const content = await readFile(path, 'utf8');
    const lines = content.split(/\r?\n/);
    const ops: StorageOp[] = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }

      try {
        const value = JSON.parse(line) as StorageOp;
        if (
          (value.op === 'insert' || value.op === 'update' || value.op === 'delete') &&
          typeof value.id === 'string' &&
          typeof value.ts === 'number'
        ) {
          ops.push(value);
        }
      } catch {
        // Ignore malformed trailing lines to preserve append-only crash safety.
      }
    }

    return ops;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

function applyOps(ops: StorageOp[]): Map<string, JsonObject> {
  const records = new Map<string, JsonObject>();

  for (const op of ops) {
    if (op.op === 'delete') {
      records.delete(op.id);
      continue;
    }

    if (!op.data || typeof op.data !== 'object' || Array.isArray(op.data)) {
      continue;
    }

    if (op.op === 'insert') {
      records.set(op.id, { ...op.data });
      continue;
    }

    const current = records.get(op.id);
    records.set(op.id, { ...(current ?? { id: op.id }), ...op.data });
  }

  return records;
}

function matchesFilter(record: JsonObject, filter?: JsonObject): boolean {
  if (!filter) {
    return true;
  }

  return Object.entries(filter).every(([key, expected]) => {
    const actual = record[key];
    if (expected && typeof expected === 'object' && actual && typeof actual === 'object') {
      return JSON.stringify(actual) === JSON.stringify(expected);
    }
    return Object.is(actual, expected);
  });
}

function compareValues(a: unknown, b: unknown): number {
  if (a === b) {
    return 0;
  }
  if (a === undefined) {
    return 1;
  }
  if (b === undefined) {
    return -1;
  }
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  if (typeof a === 'string' && typeof b === 'string') {
    return a.localeCompare(b);
  }
  return String(a).localeCompare(String(b));
}

function applyQueryOptions(records: JsonObject[], options?: StorageQueryOptions): JsonObject[] {
  let nextRecords = [...records];

  if (options?.sort) {
    const direction = options.order === 'desc' ? -1 : 1;
    nextRecords.sort(
      (a, b) => compareValues(a[options.sort as string], b[options.sort as string]) * direction,
    );
  }

  const offset = Math.max(0, options?.offset ?? 0);
  const limit = options?.limit;
  if (limit === undefined) {
    return nextRecords.slice(offset);
  }

  return nextRecords.slice(offset, offset + Math.max(0, limit));
}

function toJsonl(ops: StorageOp[]): string {
  if (ops.length === 0) {
    return '';
  }
  return `${ops.map((op) => JSON.stringify(op)).join('\n')}\n`;
}

async function ensureStorageDirs(paths: StoragePaths): Promise<void> {
  await mkdir(paths.storageDir, { recursive: true });
}

async function appendCollectionOp(path: string, op: StorageOp): Promise<void> {
  await appendFile(path, `${JSON.stringify(op)}\n`, 'utf8');
}

export async function executeStorageAction(
  homeDir: string,
  liveAppId: string,
  request: StorageAction,
): Promise<StorageActionResult> {
  const paths = getStoragePaths(homeDir, liveAppId);

  switch (request.action) {
    case 'kv.get': {
      const value = await readJsonIfExists(getKvFilePath(paths, request.name));
      return { value };
    }

    case 'kv.set': {
      if (request.value === undefined) {
        throw new Error('Storage values cannot be undefined. Use null or delete the key.');
      }
      await ensureStorageDirs(paths);
      await writeFile(
        getKvFilePath(paths, request.name),
        `${JSON.stringify(request.value, null, 2)}\n`,
        'utf8',
      );
      return { ok: true };
    }

    case 'kv.delete': {
      try {
        await rm(getKvFilePath(paths, request.name));
        return { deleted: true };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return { deleted: false };
        }
        throw error;
      }
    }

    case 'kv.list': {
      try {
        const entries = await readdir(paths.storageDir, { withFileTypes: true });
        const names = new Set<string>();
        for (const entry of entries) {
          if (!entry.isFile()) {
            continue;
          }
          if (entry.name.endsWith('.json')) {
            names.add(entry.name.slice(0, -'.json'.length));
          } else if (entry.name.endsWith('.jsonl')) {
            names.add(entry.name.slice(0, -'.jsonl'.length));
          }
        }
        return { names: [...names].sort() };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return { names: [] };
        }
        throw error;
      }
    }

    case 'collection.insert': {
      assertJsonObject(request.params, 'Collection record');
      assertRecordId(request.params.id);
      const collectionPath = getCollectionFilePath(paths, request.collection);
      const records = applyOps(await readJsonlIfExists(collectionPath));
      if (records.has(request.params.id)) {
        throw new Error(`Record '${request.params.id}' already exists.`);
      }
      await ensureStorageDirs(paths);
      await appendCollectionOp(collectionPath, {
        op: 'insert',
        id: request.params.id,
        data: { ...request.params },
        ts: Date.now(),
      });
      return { ok: true };
    }

    case 'collection.update': {
      assertRecordId(request.id);
      assertJsonObject(request.params, 'Collection update');
      if ('id' in request.params && request.params.id !== request.id) {
        throw new Error('Collection update cannot change a record id.');
      }
      const collectionPath = getCollectionFilePath(paths, request.collection);
      const records = applyOps(await readJsonlIfExists(collectionPath));
      if (!records.has(request.id)) {
        throw new Error(`Record '${request.id}' was not found.`);
      }
      await ensureStorageDirs(paths);
      await appendCollectionOp(collectionPath, {
        op: 'update',
        id: request.id,
        data: { ...request.params },
        ts: Date.now(),
      });
      return { ok: true };
    }

    case 'collection.delete': {
      assertRecordId(request.id);
      const collectionPath = getCollectionFilePath(paths, request.collection);
      const records = applyOps(await readJsonlIfExists(collectionPath));
      if (!records.has(request.id)) {
        return { ok: true };
      }
      await ensureStorageDirs(paths);
      await appendCollectionOp(collectionPath, {
        op: 'delete',
        id: request.id,
        ts: Date.now(),
      });
      return { ok: true };
    }

    case 'collection.findById': {
      assertRecordId(request.id);
      const collectionPath = getCollectionFilePath(paths, request.collection);
      const records = applyOps(await readJsonlIfExists(collectionPath));
      return { record: records.get(request.id) ?? null };
    }

    case 'collection.find': {
      if (request.filter !== undefined) {
        assertJsonObject(request.filter, 'Collection filter');
      }
      const collectionPath = getCollectionFilePath(paths, request.collection);
      const records = [...applyOps(await readJsonlIfExists(collectionPath)).values()].filter(
        (record) => matchesFilter(record, request.filter),
      );
      return { records: applyQueryOptions(records, request.options) };
    }

    case 'collection.findAll': {
      const collectionPath = getCollectionFilePath(paths, request.collection);
      return { records: [...applyOps(await readJsonlIfExists(collectionPath)).values()] };
    }

    case 'collection.count': {
      if (request.filter !== undefined) {
        assertJsonObject(request.filter, 'Collection filter');
      }
      const collectionPath = getCollectionFilePath(paths, request.collection);
      const count = [...applyOps(await readJsonlIfExists(collectionPath)).values()].filter(
        (record) => matchesFilter(record, request.filter),
      ).length;
      return { count };
    }

    case 'collection.compact': {
      const collectionPath = getCollectionFilePath(paths, request.collection);
      const records = [...applyOps(await readJsonlIfExists(collectionPath)).values()];
      await ensureStorageDirs(paths);
      const timestamp = Date.now();
      const compacted = records.map((record) => {
        assertRecordId(record.id);
        return {
          op: 'insert' as const,
          id: record.id,
          data: { ...record },
          ts: timestamp,
        };
      });
      await writeFile(collectionPath, toJsonl(compacted), 'utf8');
      return { ok: true };
    }
  }
}
