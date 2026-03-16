import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface Memory {
  id: number;
  userId: number;
  content: string;
  category: string;
  source: 'user' | 'ai' | 'system';
  createdAt: string;
  updatedAt: string;
}

interface MemoryStoreFile {
  memories: Memory[];
  nextId: number;
}

function emptyStore(): MemoryStoreFile {
  return { memories: [], nextId: 1 };
}

export class MemoryService {
  private store: MemoryStoreFile;

  constructor(private readonly filePath: string) {
    this.store = this.load();
  }

  // ── Persistence ──────────────────────────────────────────────────────────

  private load(): MemoryStoreFile {
    if (!existsSync(this.filePath)) {
      return emptyStore();
    }
    try {
      return JSON.parse(readFileSync(this.filePath, 'utf-8')) as MemoryStoreFile;
    } catch {
      return emptyStore();
    }
  }

  private save(): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(this.filePath, JSON.stringify(this.store, null, 2), 'utf-8');
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────

  createMemory(
    userId: number,
    content: string,
    options?: { category?: string; source?: Memory['source'] },
  ): Memory {
    const now = new Date().toISOString();
    const memory: Memory = {
      id: this.store.nextId++,
      userId,
      content,
      category: options?.category ?? 'general',
      source: options?.source ?? 'user',
      createdAt: now,
      updatedAt: now,
    };

    this.store.memories.push(memory);
    this.save();
    return memory;
  }

  getMemory(id: number): Memory | undefined {
    return this.store.memories.find((m) => m.id === id);
  }

  listMemories(userId: number, options?: { category?: string }): Memory[] {
    let results = this.store.memories.filter((m) => m.userId === userId);
    if (options?.category) {
      results = results.filter((m) => m.category === options.category);
    }
    return results;
  }

  updateMemory(id: number, updates: { content?: string; category?: string }): Memory {
    const memory = this.store.memories.find((m) => m.id === id);
    if (!memory) throw new Error('Memory not found');

    if (updates.content !== undefined) {
      memory.content = updates.content;
    }
    if (updates.category !== undefined) {
      memory.category = updates.category;
    }
    memory.updatedAt = new Date().toISOString();
    this.save();
    return memory;
  }

  deleteMemory(id: number): void {
    const idx = this.store.memories.findIndex((m) => m.id === id);
    if (idx === -1) throw new Error('Memory not found');
    this.store.memories.splice(idx, 1);
    this.save();
  }

  /** Remove all memories belonging to a specific user. */
  deleteUserMemories(userId: number): void {
    this.store.memories = this.store.memories.filter((m) => m.userId !== userId);
    this.save();
  }

  /** Search memories by keyword (case-insensitive substring match on content). */
  searchMemories(userId: number, query: string): Memory[] {
    const lower = query.toLowerCase();
    return this.store.memories.filter(
      (m) => m.userId === userId && m.content.toLowerCase().includes(lower),
    );
  }
}
