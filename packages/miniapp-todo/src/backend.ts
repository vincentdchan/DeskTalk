import type { MiniAppManifest, MiniAppContext, MiniAppBackendActivation } from '@desktalk/sdk';
import type { TodoList, TodoItem, TodoListWithCount } from './types';

// ─── Manifest ────────────────────────────────────────────────────────────────

export const manifest: MiniAppManifest = {
  id: 'todo',
  name: 'Todo',
  icon: '\u2705',
  version: '0.1.0',
  description: 'Task management with lists, priorities, and due dates',
};

// ─── Constants ───────────────────────────────────────────────────────────────

const INBOX_LIST_ID = 'inbox';
const LIST_PREFIX = 'list:';
const ITEM_PREFIX = 'item:';

function generateId(): string {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

// ─── Activate ────────────────────────────────────────────────────────────────

export function activate(ctx: MiniAppContext): MiniAppBackendActivation {
  ctx.logger.info('Todo MiniApp activated');

  /** Ensure the default Inbox list exists. */
  async function ensureInbox(): Promise<void> {
    const existing = await ctx.storage.get<TodoList>(`${LIST_PREFIX}${INBOX_LIST_ID}`);
    if (!existing) {
      const inbox: TodoList = {
        id: INBOX_LIST_ID,
        name: 'Inbox',
        createdAt: new Date().toISOString(),
      };
      await ctx.storage.set(`${LIST_PREFIX}${INBOX_LIST_ID}`, inbox);
    }
  }

  /** Get all lists from storage. */
  async function getAllLists(): Promise<TodoList[]> {
    return ctx.storage.query<TodoList>({ prefix: LIST_PREFIX });
  }

  /** Get all items from storage, optionally filtered by listId. */
  async function getItems(listId?: string): Promise<TodoItem[]> {
    if (listId) {
      return ctx.storage.query<TodoItem>({
        prefix: ITEM_PREFIX,
        filter: (item) => item.listId === listId,
      });
    }
    return ctx.storage.query<TodoItem>({ prefix: ITEM_PREFIX });
  }

  // Ensure inbox on activation
  ensureInbox().catch((err) => ctx.logger.error('Failed to ensure inbox list', err));

  // ─── todos.lists.list ──────────────────────────────────────────────────

  ctx.messaging.onCommand<void, TodoListWithCount[]>('todos.lists.list', async () => {
    await ensureInbox();
    const lists = await getAllLists();
    const allItems = await getItems();

    const countsMap = new Map<string, number>();
    for (const item of allItems) {
      countsMap.set(item.listId, (countsMap.get(item.listId) ?? 0) + 1);
    }

    const result: TodoListWithCount[] = lists
      .map((list) => ({
        ...list,
        itemCount: countsMap.get(list.id) ?? 0,
      }))
      .sort((a, b) => {
        // Inbox always first
        if (a.id === INBOX_LIST_ID) return -1;
        if (b.id === INBOX_LIST_ID) return 1;
        return a.createdAt.localeCompare(b.createdAt);
      });

    return result;
  });

  // ─── todos.lists.create ────────────────────────────────────────────────

  ctx.messaging.onCommand<{ name: string }, TodoList>('todos.lists.create', async (req) => {
    const id = generateId();
    const now = new Date().toISOString();
    const list: TodoList = {
      id,
      name: req.name,
      createdAt: now,
    };
    await ctx.storage.set(`${LIST_PREFIX}${id}`, list);
    ctx.logger.info(`Created list: ${id} (${req.name})`);
    return list;
  });

  // ─── todos.lists.rename ────────────────────────────────────────────────

  ctx.messaging.onCommand<{ id: string; name: string }, TodoList>(
    'todos.lists.rename',
    async (req) => {
      if (req.id === INBOX_LIST_ID) {
        throw new Error('Cannot rename the Inbox list');
      }
      const list = await ctx.storage.get<TodoList>(`${LIST_PREFIX}${req.id}`);
      if (!list) throw new Error(`List not found: ${req.id}`);
      list.name = req.name;
      await ctx.storage.set(`${LIST_PREFIX}${req.id}`, list);
      ctx.logger.info(`Renamed list: ${req.id} -> ${req.name}`);
      return list;
    },
  );

  // ─── todos.lists.delete ────────────────────────────────────────────────

  ctx.messaging.onCommand<{ id: string }, void>('todos.lists.delete', async (req) => {
    if (req.id === INBOX_LIST_ID) {
      throw new Error('Cannot delete the Inbox list');
    }
    // Delete all items in this list
    const items = await getItems(req.id);
    for (const item of items) {
      await ctx.storage.delete(`${ITEM_PREFIX}${item.id}`);
    }
    await ctx.storage.delete(`${LIST_PREFIX}${req.id}`);
    ctx.logger.info(`Deleted list: ${req.id} (${items.length} items removed)`);
  });

  // ─── todos.items.list ──────────────────────────────────────────────────

  ctx.messaging.onCommand<{ listId: string }, TodoItem[]>('todos.items.list', async (req) => {
    const items = await getItems(req.listId);
    // Sort: incomplete first, then by createdAt descending
    items.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return b.createdAt.localeCompare(a.createdAt);
    });
    return items;
  });

  // ─── todos.items.create ────────────────────────────────────────────────

  ctx.messaging.onCommand<
    { listId: string; title: string; priority?: string; dueDate?: string },
    TodoItem
  >('todos.items.create', async (req) => {
    const id = generateId();
    const now = new Date().toISOString();
    const item: TodoItem = {
      id,
      listId: req.listId,
      title: req.title,
      completed: false,
      priority: (req.priority as TodoItem['priority']) ?? 'none',
      dueDate: req.dueDate ?? null,
      createdAt: now,
      updatedAt: now,
    };
    await ctx.storage.set(`${ITEM_PREFIX}${id}`, item);
    ctx.logger.info(`Created item: ${id} (${req.title})`);
    return item;
  });

  // ─── todos.items.update ────────────────────────────────────────────────

  ctx.messaging.onCommand<
    {
      id: string;
      title?: string;
      completed?: boolean;
      priority?: string;
      dueDate?: string;
    },
    TodoItem
  >('todos.items.update', async (req) => {
    const item = await ctx.storage.get<TodoItem>(`${ITEM_PREFIX}${req.id}`);
    if (!item) throw new Error(`Item not found: ${req.id}`);

    if (req.title !== undefined) item.title = req.title;
    if (req.completed !== undefined) item.completed = req.completed;
    if (req.priority !== undefined) item.priority = req.priority as TodoItem['priority'];
    if (req.dueDate !== undefined) item.dueDate = req.dueDate || null;
    item.updatedAt = new Date().toISOString();

    await ctx.storage.set(`${ITEM_PREFIX}${req.id}`, item);
    ctx.logger.info(`Updated item: ${req.id}`);
    return item;
  });

  // ─── todos.items.delete ────────────────────────────────────────────────

  ctx.messaging.onCommand<{ id: string }, void>('todos.items.delete', async (req) => {
    await ctx.storage.delete(`${ITEM_PREFIX}${req.id}`);
    ctx.logger.info(`Deleted item: ${req.id}`);
  });

  return {};
}

export function deactivate(): void {
  // cleanup
}
