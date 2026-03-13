import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import type { StorageHook } from '@desktalk/sdk';

/**
 * Creates a scoped key-value storage hook for a MiniApp.
 * Data is persisted as a JSON file at the given path.
 */
export function createStorageHook(storagePath: string): StorageHook {
  function readStore(): Record<string, unknown> {
    if (!existsSync(storagePath)) {
      return {};
    }
    try {
      const raw = readFileSync(storagePath, 'utf-8');
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  function writeStore(store: Record<string, unknown>): void {
    writeFileSync(storagePath, JSON.stringify(store, null, 2), 'utf-8');
  }

  return {
    async get<T>(key: string): Promise<T | undefined> {
      const store = readStore();
      return store[key] as T | undefined;
    },

    async set<T>(key: string, value: T): Promise<void> {
      const store = readStore();
      store[key] = value;
      writeStore(store);
    },

    async delete(key: string): Promise<void> {
      const store = readStore();
      delete store[key];
      writeStore(store);
    },

    async list(): Promise<string[]> {
      const store = readStore();
      return Object.keys(store);
    },

    async query<T>(options: { prefix?: string; filter?: (v: T) => boolean }): Promise<T[]> {
      const store = readStore();
      let entries = Object.entries(store);

      if (options.prefix) {
        entries = entries.filter(([key]) => key.startsWith(options.prefix!));
      }

      let values = entries.map(([, value]) => value as T);

      if (options.filter) {
        values = values.filter(options.filter);
      }

      return values;
    },
  };
}
