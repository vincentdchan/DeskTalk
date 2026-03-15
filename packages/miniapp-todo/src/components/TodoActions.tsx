import React, { useCallback } from 'react';
import { ActionsProvider, Action, useCommand } from '@desktalk/sdk';
import type { TodoItem, TodoList } from '../types';

interface TodoActionsProps {
  children: React.ReactNode;
  selectedListId: string | null;
  lists: Array<{ id: string; name: string }>;
  onItemCreated: (item: TodoItem) => void;
  onItemUpdated: (item: TodoItem) => void;
  onItemDeleted: (id: string) => void;
  onListCreated: (list: TodoList) => void;
  onListDeleted: (id: string) => void;
  onRefresh: () => void;
}

export function TodoActions({
  children,
  selectedListId,
  lists,
  onItemCreated,
  onItemUpdated,
  onItemDeleted,
  onListCreated,
  onListDeleted,
  onRefresh: _onRefresh,
}: TodoActionsProps) {
  const createItem = useCommand<
    { listId: string; title: string; priority?: string; dueDate?: string },
    TodoItem
  >('todos.items.create');
  const updateItem = useCommand<
    { id: string; title?: string; completed?: boolean; priority?: string; dueDate?: string },
    TodoItem
  >('todos.items.update');
  const deleteItem = useCommand<{ id: string }, void>('todos.items.delete');
  const createList = useCommand<{ name: string }, TodoList>('todos.lists.create');
  const deleteList = useCommand<{ id: string }, void>('todos.lists.delete');

  // ─── Add Todo ────────────────────────────────────────────────────────────

  const handleAddTodo = useCallback(
    async (params?: Record<string, unknown>) => {
      const title = (params?.title as string) || '';
      if (!title) return;

      // Resolve list: use param, or find by name, or use selected list, or inbox
      let listId = selectedListId && selectedListId !== '__all__' ? selectedListId : 'inbox';
      if (params?.list) {
        const listName = (params.list as string).toLowerCase();
        const found = lists.find((l) => l.name.toLowerCase() === listName);
        if (found) listId = found.id;
      }

      const item = await createItem({
        listId,
        title,
        priority: (params?.priority as string) || undefined,
        dueDate: (params?.dueDate as string) || undefined,
      });
      onItemCreated(item);
      return item;
    },
    [createItem, selectedListId, lists, onItemCreated],
  );

  // ─── Complete Todo ───────────────────────────────────────────────────────

  const handleComplete = useCallback(
    async (params?: Record<string, unknown>) => {
      const id = (params?.id as string) || '';
      if (!id) return;
      const item = await updateItem({ id, completed: true });
      onItemUpdated(item);
      return item;
    },
    [updateItem, onItemUpdated],
  );

  // ─── Uncomplete Todo ────────────────────────────────────────────────────

  const handleUncomplete = useCallback(
    async (params?: Record<string, unknown>) => {
      const id = (params?.id as string) || '';
      if (!id) return;
      const item = await updateItem({ id, completed: false });
      onItemUpdated(item);
      return item;
    },
    [updateItem, onItemUpdated],
  );

  // ─── Delete Todo ─────────────────────────────────────────────────────────

  const handleDeleteTodo = useCallback(
    async (params?: Record<string, unknown>) => {
      const id = (params?.id as string) || '';
      if (!id) return;
      await deleteItem({ id });
      onItemDeleted(id);
    },
    [deleteItem, onItemDeleted],
  );

  // ─── Create List ─────────────────────────────────────────────────────────

  const handleCreateList = useCallback(
    async (params?: Record<string, unknown>) => {
      const name = (params?.name as string) || '';
      if (!name) return;
      const list = await createList({ name });
      onListCreated(list);
      return list;
    },
    [createList, onListCreated],
  );

  // ─── Delete List ─────────────────────────────────────────────────────────

  const handleDeleteList = useCallback(
    async (params?: Record<string, unknown>) => {
      const name = (params?.name as string) || '';
      if (!name) return;
      const found = lists.find((l) => l.name.toLowerCase() === name.toLowerCase());
      if (!found) return;
      await deleteList({ id: found.id });
      onListDeleted(found.id);
    },
    [deleteList, lists, onListDeleted],
  );

  return (
    <ActionsProvider>
      <Action
        name="Add Todo"
        description="Create a new todo item in the current list"
        params={{
          title: { type: 'string', description: 'Todo title', required: true },
          list: { type: 'string', description: 'Target list name', required: false },
          priority: {
            type: 'string',
            description: 'Priority: none, low, medium, high',
            required: false,
          },
          dueDate: {
            type: 'string',
            description: 'Due date in ISO 8601 format',
            required: false,
          },
        }}
        handler={handleAddTodo}
      />
      <Action
        name="Complete Todo"
        description="Mark a todo as complete"
        params={{
          id: { type: 'string', description: 'Todo item ID', required: true },
        }}
        handler={handleComplete}
      />
      <Action
        name="Uncomplete Todo"
        description="Mark a todo as incomplete"
        params={{
          id: { type: 'string', description: 'Todo item ID', required: true },
        }}
        handler={handleUncomplete}
      />
      <Action
        name="Delete Todo"
        description="Delete a todo item"
        params={{
          id: { type: 'string', description: 'Todo item ID', required: true },
        }}
        handler={handleDeleteTodo}
      />
      <Action
        name="Create List"
        description="Create a new todo list"
        params={{
          name: { type: 'string', description: 'List name', required: true },
        }}
        handler={handleCreateList}
      />
      <Action
        name="Delete List"
        description="Delete a todo list and all its items"
        params={{
          name: { type: 'string', description: 'List name', required: true },
        }}
        handler={handleDeleteList}
      />
      {children}
    </ActionsProvider>
  );
}
