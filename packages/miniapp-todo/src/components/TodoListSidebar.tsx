import React, { useState, useRef, useCallback } from 'react';
import type { TodoListWithCount } from '../types';
import styles from './TodoListSidebar.module.css';

interface TodoListSidebarProps {
  lists: TodoListWithCount[];
  selectedListId: string | null;
  onSelectList: (id: string) => void;
  onCreateList: (name: string) => void;
  onDeleteList: (id: string) => void;
}

const INBOX_LIST_ID = 'inbox';

export function TodoListSidebar({
  lists,
  selectedListId,
  onSelectList,
  onCreateList,
  onDeleteList,
}: TodoListSidebarProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newListName, setNewListName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleStartCreate = useCallback(() => {
    setIsCreating(true);
    setNewListName('');
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const handleCreateSubmit = useCallback(() => {
    const name = newListName.trim();
    if (name) {
      onCreateList(name);
    }
    setIsCreating(false);
    setNewListName('');
  }, [newListName, onCreateList]);

  const handleCreateKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleCreateSubmit();
      } else if (e.key === 'Escape') {
        setIsCreating(false);
        setNewListName('');
      }
    },
    [handleCreateSubmit],
  );

  // Compute total count for "All" virtual list
  const totalCount = lists.reduce((sum, l) => sum + l.itemCount, 0);

  return (
    <div className={styles.sidebarPanel}>
      <div className={styles.sidebarHeader}>
        <span className={styles.sidebarTitle}>Lists</span>
        <button className={styles.newListBtn} onClick={handleStartCreate} title="New list">
          +
        </button>
      </div>
      <div className={styles.listItems}>
        {/* "All" virtual list */}
        <div
          className={selectedListId === null ? styles.listItemActive : styles.listItem}
          onClick={() => onSelectList('__all__')}
        >
          <span className={styles.listItemName}>All</span>
          <span className={styles.listItemCount}>{totalCount}</span>
        </div>

        {lists.map((list) => (
          <div
            key={list.id}
            className={selectedListId === list.id ? styles.listItemActive : styles.listItem}
            onClick={() => onSelectList(list.id)}
          >
            <span className={styles.listItemName}>{list.name}</span>
            <span className={styles.listItemCount}>{list.itemCount}</span>
            {list.id !== INBOX_LIST_ID && (
              <button
                className={styles.listItemDeleteBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteList(list.id);
                }}
                title="Delete list"
              >
                x
              </button>
            )}
          </div>
        ))}

        {isCreating && (
          <div className={styles.listItem}>
            <input
              ref={inputRef}
              className={styles.newListInput}
              type="text"
              placeholder="List name..."
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              onKeyDown={handleCreateKeyDown}
              onBlur={handleCreateSubmit}
            />
          </div>
        )}
      </div>
    </div>
  );
}
