import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryService } from './memory-service';
import { existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const TEST_DIR = join(tmpdir(), 'desktalk-memory-service-test');
const TEST_FILE = join(TEST_DIR, 'memories.json');

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  if (existsSync(TEST_FILE)) unlinkSync(TEST_FILE);
});

afterEach(() => {
  if (existsSync(TEST_FILE)) unlinkSync(TEST_FILE);
});

describe('MemoryService', () => {
  describe('createMemory', () => {
    it('creates a memory with default category and source', () => {
      const svc = new MemoryService(TEST_FILE);
      const memory = svc.createMemory(1, 'User prefers dark mode');
      expect(memory.id).toBe(1);
      expect(memory.userId).toBe(1);
      expect(memory.content).toBe('User prefers dark mode');
      expect(memory.category).toBe('general');
      expect(memory.source).toBe('user');
      expect(memory.createdAt).toBeTruthy();
      expect(memory.updatedAt).toBeTruthy();
    });

    it('creates a memory with custom category and source', () => {
      const svc = new MemoryService(TEST_FILE);
      const memory = svc.createMemory(1, 'User likes TypeScript', {
        category: 'preference',
        source: 'ai',
      });
      expect(memory.category).toBe('preference');
      expect(memory.source).toBe('ai');
    });

    it('auto-increments IDs', () => {
      const svc = new MemoryService(TEST_FILE);
      const m1 = svc.createMemory(1, 'First memory');
      const m2 = svc.createMemory(1, 'Second memory');
      expect(m1.id).toBe(1);
      expect(m2.id).toBe(2);
    });
  });

  describe('getMemory', () => {
    it('returns a memory by id', () => {
      const svc = new MemoryService(TEST_FILE);
      const created = svc.createMemory(1, 'Test memory');
      const found = svc.getMemory(created.id);
      expect(found).toBeDefined();
      expect(found!.content).toBe('Test memory');
    });

    it('returns undefined for unknown id', () => {
      const svc = new MemoryService(TEST_FILE);
      expect(svc.getMemory(999)).toBeUndefined();
    });
  });

  describe('listMemories', () => {
    it('lists memories for a specific user', () => {
      const svc = new MemoryService(TEST_FILE);
      svc.createMemory(1, 'User 1 memory');
      svc.createMemory(2, 'User 2 memory');
      svc.createMemory(1, 'Another user 1 memory');
      const list = svc.listMemories(1);
      expect(list).toHaveLength(2);
      expect(list.every((m) => m.userId === 1)).toBe(true);
    });

    it('filters by category', () => {
      const svc = new MemoryService(TEST_FILE);
      svc.createMemory(1, 'General fact', { category: 'general' });
      svc.createMemory(1, 'Preference', { category: 'preference' });
      svc.createMemory(1, 'Another general', { category: 'general' });
      const list = svc.listMemories(1, { category: 'preference' });
      expect(list).toHaveLength(1);
      expect(list[0].content).toBe('Preference');
    });

    it('returns empty array when user has no memories', () => {
      const svc = new MemoryService(TEST_FILE);
      expect(svc.listMemories(999)).toHaveLength(0);
    });
  });

  describe('updateMemory', () => {
    it('updates content', () => {
      const svc = new MemoryService(TEST_FILE);
      const memory = svc.createMemory(1, 'Original content');
      const updated = svc.updateMemory(memory.id, { content: 'Updated content' });
      expect(updated.content).toBe('Updated content');
      expect(updated.updatedAt).toBeTruthy();
    });

    it('updates category', () => {
      const svc = new MemoryService(TEST_FILE);
      const memory = svc.createMemory(1, 'Test');
      const updated = svc.updateMemory(memory.id, { category: 'preference' });
      expect(updated.category).toBe('preference');
    });

    it('throws for unknown memory', () => {
      const svc = new MemoryService(TEST_FILE);
      expect(() => svc.updateMemory(999, { content: 'nope' })).toThrow('Memory not found');
    });
  });

  describe('deleteMemory', () => {
    it('deletes a memory by id', () => {
      const svc = new MemoryService(TEST_FILE);
      const memory = svc.createMemory(1, 'To be deleted');
      svc.deleteMemory(memory.id);
      expect(svc.getMemory(memory.id)).toBeUndefined();
    });

    it('throws for unknown memory', () => {
      const svc = new MemoryService(TEST_FILE);
      expect(() => svc.deleteMemory(999)).toThrow('Memory not found');
    });
  });

  describe('deleteUserMemories', () => {
    it('removes all memories for a user', () => {
      const svc = new MemoryService(TEST_FILE);
      svc.createMemory(1, 'User 1 memory A');
      svc.createMemory(1, 'User 1 memory B');
      svc.createMemory(2, 'User 2 memory');
      svc.deleteUserMemories(1);
      expect(svc.listMemories(1)).toHaveLength(0);
      expect(svc.listMemories(2)).toHaveLength(1);
    });
  });

  describe('searchMemories', () => {
    it('finds memories by keyword (case-insensitive)', () => {
      const svc = new MemoryService(TEST_FILE);
      svc.createMemory(1, 'User prefers dark mode');
      svc.createMemory(1, 'User likes TypeScript');
      svc.createMemory(1, 'Prefers tabs over spaces');
      const results = svc.searchMemories(1, 'prefers');
      expect(results).toHaveLength(2);
    });

    it('scopes search to the specified user', () => {
      const svc = new MemoryService(TEST_FILE);
      svc.createMemory(1, 'User 1 prefers dark mode');
      svc.createMemory(2, 'User 2 prefers light mode');
      const results = svc.searchMemories(1, 'prefers');
      expect(results).toHaveLength(1);
      expect(results[0].userId).toBe(1);
    });

    it('returns empty array when no matches', () => {
      const svc = new MemoryService(TEST_FILE);
      svc.createMemory(1, 'Some content');
      expect(svc.searchMemories(1, 'nonexistent')).toHaveLength(0);
    });
  });

  describe('persistence', () => {
    it('survives service restart', () => {
      const svc1 = new MemoryService(TEST_FILE);
      svc1.createMemory(1, 'Persistent memory');

      // Create a new instance (simulates restart)
      const svc2 = new MemoryService(TEST_FILE);
      const list = svc2.listMemories(1);
      expect(list).toHaveLength(1);
      expect(list[0].content).toBe('Persistent memory');
    });

    it('preserves nextId across restarts', () => {
      const svc1 = new MemoryService(TEST_FILE);
      svc1.createMemory(1, 'First');
      svc1.createMemory(1, 'Second');

      const svc2 = new MemoryService(TEST_FILE);
      const m = svc2.createMemory(1, 'Third');
      expect(m.id).toBe(3);
    });
  });
});
