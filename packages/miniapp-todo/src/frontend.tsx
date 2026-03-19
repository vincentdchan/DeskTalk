import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import type { MiniAppFrontendActivation, MiniAppFrontendContext } from '@desktalk/sdk';
import { useCommand, MiniAppIdProvider, WindowIdProvider } from '@desktalk/sdk';
import type { TodoItem, TodoList, TodoListWithCount } from './types';
import { TodoListSidebar } from './components/TodoListSidebar';
import { TodoItemList, type SortMode } from './components/TodoItemList';
import { TodoActions } from './components/TodoActions';
import styles from './TodoApp.module.css';

const ALL_LIST_ID = '__all__';

function TodoApp() {
  // ─── State ───────────────────────────────────────────────────────────────
  const [lists, setLists] = useState<TodoListWithCount[]>([]);
  const [items, setItems] = useState<TodoItem[]>([]);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('created');

  // ─── Backend commands ────────────────────────────────────────────────────
  const listLists = useCommand<void, TodoListWithCount[]>('todos.lists.list');
  const listItems = useCommand<{ listId: string }, TodoItem[]>('todos.items.list');
  const createList = useCommand<{ name: string }, TodoList>('todos.lists.create');
  const deleteList = useCommand<{ id: string }, void>('todos.lists.delete');
  const createItem = useCommand<
    { listId: string; title: string; priority?: string; dueDate?: string },
    TodoItem
  >('todos.items.create');
  const updateItem = useCommand<
    { id: string; title?: string; completed?: boolean; priority?: string; dueDate?: string },
    TodoItem
  >('todos.items.update');
  const deleteItem = useCommand<{ id: string }, void>('todos.items.delete');

  // ─── Data fetching ───────────────────────────────────────────────────────

  const fetchLists = useCallback(async () => {
    try {
      const result = await listLists();
      setLists(result);
    } catch (err) {
      console.error('Failed to fetch lists:', err);
    }
  }, [listLists]);

  const fetchItems = useCallback(async () => {
    if (!selectedListId) return;
    try {
      if (selectedListId === ALL_LIST_ID) {
        // Fetch items from all lists
        const allLists = await listLists();
        const allItems: TodoItem[] = [];
        for (const list of allLists) {
          const listItemsResult = await listItems({ listId: list.id });
          allItems.push(...listItemsResult);
        }
        setItems(allItems);
      } else {
        const result = await listItems({ listId: selectedListId });
        setItems(result);
      }
    } catch (err) {
      console.error('Failed to fetch items:', err);
    }
  }, [selectedListId, listItems, listLists]);

  const refresh = useCallback(() => {
    fetchLists();
    fetchItems();
  }, [fetchLists, fetchItems]);

  // Initial load
  useEffect(() => {
    fetchLists();
  }, [fetchLists]);

  // Fetch items when selected list changes
  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Auto-select first list when lists load and nothing is selected
  useEffect(() => {
    if (selectedListId === null && lists.length > 0) {
      setSelectedListId(lists[0].id);
    }
  }, [lists, selectedListId]);

  // ─── List actions ────────────────────────────────────────────────────────

  const handleSelectList = useCallback((id: string) => {
    setSelectedListId(id === ALL_LIST_ID ? ALL_LIST_ID : id);
  }, []);

  const handleCreateList = useCallback(
    async (name: string) => {
      try {
        const list = await createList({ name });
        await fetchLists();
        setSelectedListId(list.id);
      } catch (err) {
        console.error('Failed to create list:', err);
      }
    },
    [createList, fetchLists],
  );

  const handleDeleteList = useCallback(
    async (id: string) => {
      try {
        await deleteList({ id });
        if (selectedListId === id) {
          setSelectedListId(null);
          setItems([]);
        }
        await fetchLists();
      } catch (err) {
        console.error('Failed to delete list:', err);
      }
    },
    [deleteList, selectedListId, fetchLists],
  );

  // ─── Item actions ────────────────────────────────────────────────────────

  const handleAddItem = useCallback(
    async (title: string) => {
      const listId = selectedListId && selectedListId !== ALL_LIST_ID ? selectedListId : 'inbox';
      try {
        await createItem({ listId, title });
        refresh();
      } catch (err) {
        console.error('Failed to create item:', err);
      }
    },
    [createItem, selectedListId, refresh],
  );

  const handleToggleComplete = useCallback(
    async (id: string, completed: boolean) => {
      try {
        await updateItem({ id, completed });
        refresh();
      } catch (err) {
        console.error('Failed to toggle item:', err);
      }
    },
    [updateItem, refresh],
  );

  const handleUpdateTitle = useCallback(
    async (id: string, title: string) => {
      try {
        await updateItem({ id, title });
        refresh();
      } catch (err) {
        console.error('Failed to update title:', err);
      }
    },
    [updateItem, refresh],
  );

  const handleUpdatePriority = useCallback(
    async (id: string, priority: TodoItem['priority']) => {
      try {
        await updateItem({ id, priority });
        refresh();
      } catch (err) {
        console.error('Failed to update priority:', err);
      }
    },
    [updateItem, refresh],
  );

  const handleUpdateDueDate = useCallback(
    async (id: string, dueDate: string | null) => {
      try {
        await updateItem({ id, dueDate: dueDate ?? '' });
        refresh();
      } catch (err) {
        console.error('Failed to update due date:', err);
      }
    },
    [updateItem, refresh],
  );

  const handleDeleteItem = useCallback(
    async (id: string) => {
      try {
        await deleteItem({ id });
        refresh();
      } catch (err) {
        console.error('Failed to delete item:', err);
      }
    },
    [deleteItem, refresh],
  );

  // ─── Action callbacks (from AI-invoked actions) ─────────────────────────

  const handleActionItemCreated = useCallback(() => {
    refresh();
  }, [refresh]);

  const handleActionItemUpdated = useCallback(() => {
    refresh();
  }, [refresh]);

  const handleActionItemDeleted = useCallback(() => {
    refresh();
  }, [refresh]);

  const handleActionListCreated = useCallback(
    (list: TodoList) => {
      fetchLists();
      setSelectedListId(list.id);
    },
    [fetchLists],
  );

  const handleActionListDeleted = useCallback(
    (id: string) => {
      if (selectedListId === id) {
        setSelectedListId(null);
        setItems([]);
      }
      fetchLists();
    },
    [selectedListId, fetchLists],
  );

  // ─── Resolve selected list name ─────────────────────────────────────────

  const selectedListName =
    selectedListId === ALL_LIST_ID
      ? 'All'
      : (lists.find((l) => l.id === selectedListId)?.name ?? 'Inbox');

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <TodoActions
      selectedListId={selectedListId}
      lists={lists}
      onItemCreated={handleActionItemCreated}
      onItemUpdated={handleActionItemUpdated}
      onItemDeleted={handleActionItemDeleted}
      onListCreated={handleActionListCreated}
      onListDeleted={handleActionListDeleted}
      onRefresh={refresh}
    >
      <div className={styles.root}>
        <TodoListSidebar
          lists={lists}
          selectedListId={selectedListId === ALL_LIST_ID ? null : selectedListId}
          onSelectList={handleSelectList}
          onCreateList={handleCreateList}
          onDeleteList={handleDeleteList}
        />
        <TodoItemList
          items={items}
          listName={selectedListName}
          sortMode={sortMode}
          onSortChange={setSortMode}
          onToggleComplete={handleToggleComplete}
          onUpdateTitle={handleUpdateTitle}
          onUpdatePriority={handleUpdatePriority}
          onUpdateDueDate={handleUpdateDueDate}
          onDelete={handleDeleteItem}
          onAddItem={handleAddItem}
        />
      </div>
    </TodoActions>
  );
}

export function activate(ctx: MiniAppFrontendContext): MiniAppFrontendActivation {
  const root = createRoot(ctx.root);
  root.render(
    <WindowIdProvider windowId={ctx.windowId}>
      <MiniAppIdProvider miniAppId={ctx.miniAppId}>
        <TodoApp />
      </MiniAppIdProvider>
    </WindowIdProvider>,
  );

  return {
    deactivate() {
      root.unmount();
    },
  };
}
