import React, { useState, useRef, useCallback } from 'react';
import type { TodoItem as TodoItemType } from '../types';
import { TodoItem } from './TodoItem';
import styles from './TodoItemList.module.css';

export type SortMode = 'created' | 'dueDate' | 'priority';

interface TodoItemListProps {
  items: TodoItemType[];
  listName: string;
  sortMode: SortMode;
  onSortChange: (mode: SortMode) => void;
  onToggleComplete: (id: string, completed: boolean) => void;
  onUpdateTitle: (id: string, title: string) => void;
  onUpdatePriority: (id: string, priority: TodoItemType['priority']) => void;
  onUpdateDueDate: (id: string, dueDate: string | null) => void;
  onDelete: (id: string) => void;
  onAddItem: (title: string) => void;
}

const PRIORITY_ORDER: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
  none: 3,
};

function sortItems(items: TodoItemType[], mode: SortMode): TodoItemType[] {
  const sorted = [...items];
  sorted.sort((a, b) => {
    // Completed items always at the bottom
    if (a.completed !== b.completed) return a.completed ? 1 : -1;

    switch (mode) {
      case 'dueDate': {
        // Items with due dates first, sorted ascending
        if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return b.createdAt.localeCompare(a.createdAt);
      }
      case 'priority': {
        const pa = PRIORITY_ORDER[a.priority] ?? 3;
        const pb = PRIORITY_ORDER[b.priority] ?? 3;
        if (pa !== pb) return pa - pb;
        return b.createdAt.localeCompare(a.createdAt);
      }
      case 'created':
      default:
        return b.createdAt.localeCompare(a.createdAt);
    }
  });
  return sorted;
}

export function TodoItemList({
  items,
  listName,
  sortMode,
  onSortChange,
  onToggleComplete,
  onUpdateTitle,
  onUpdatePriority,
  onUpdateDueDate,
  onDelete,
  onAddItem,
}: TodoItemListProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleStartAdd = useCallback(() => {
    setIsAdding(true);
    setNewTitle('');
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const handleAddSubmit = useCallback(() => {
    const title = newTitle.trim();
    if (title) {
      onAddItem(title);
    }
    setNewTitle('');
    // Keep the input open for quick entry
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [newTitle, onAddItem]);

  const handleAddKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleAddSubmit();
      } else if (e.key === 'Escape') {
        setIsAdding(false);
        setNewTitle('');
      }
    },
    [handleAddSubmit],
  );

  const sortedItems = sortItems(items, sortMode);

  return (
    <div className={styles.itemsPanel}>
      <div className={styles.itemsHeader}>
        <div className={styles.itemsTitle}>{listName}</div>
        <div className={styles.itemsHeaderActions}>
          <select
            className={styles.sortSelect}
            value={sortMode}
            onChange={(e) => onSortChange(e.target.value as SortMode)}
          >
            <option value="created">Date Created</option>
            <option value="dueDate">Due Date</option>
            <option value="priority">Priority</option>
          </select>
          <button className={styles.addItemBtn} onClick={handleStartAdd} title="Add todo">
            +
          </button>
        </div>
      </div>

      {isAdding && (
        <div className={styles.newItemRow}>
          <input
            ref={inputRef}
            className={styles.newItemInput}
            type="text"
            placeholder="What needs to be done?"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={handleAddKeyDown}
            onBlur={() => {
              if (!newTitle.trim()) setIsAdding(false);
            }}
          />
        </div>
      )}

      <div className={styles.itemsList}>
        {sortedItems.length === 0 && !isAdding ? (
          <div className={styles.emptyState}>No todos yet. Click + to add one.</div>
        ) : (
          sortedItems.map((item) => (
            <TodoItem
              key={item.id}
              item={item}
              onToggleComplete={onToggleComplete}
              onUpdateTitle={onUpdateTitle}
              onUpdatePriority={onUpdatePriority}
              onUpdateDueDate={onUpdateDueDate}
              onDelete={onDelete}
            />
          ))
        )}
      </div>
    </div>
  );
}
