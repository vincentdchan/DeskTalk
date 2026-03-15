import React, { useState, useRef, useCallback } from 'react';
import type { TodoItem as TodoItemType } from '../types';
import styles from './TodoItem.module.css';

interface TodoItemProps {
  item: TodoItemType;
  onToggleComplete: (id: string, completed: boolean) => void;
  onUpdateTitle: (id: string, title: string) => void;
  onUpdatePriority: (id: string, priority: TodoItemType['priority']) => void;
  onUpdateDueDate: (id: string, dueDate: string | null) => void;
  onDelete: (id: string) => void;
}

function formatDueDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const due = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays < 7) return `In ${diffDays}d`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function isOverdue(iso: string): boolean {
  try {
    const d = new Date(iso);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const due = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return due.getTime() < today.getTime();
  } catch {
    return false;
  }
}

export function TodoItem({
  item,
  onToggleComplete,
  onUpdateTitle,
  onUpdatePriority,
  onUpdateDueDate,
  onDelete,
}: TodoItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(item.title);
  const [showDetail, setShowDetail] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  const handleStartEdit = useCallback(() => {
    setIsEditing(true);
    setEditTitle(item.title);
    setTimeout(() => titleInputRef.current?.focus(), 0);
  }, [item.title]);

  const handleSaveTitle = useCallback(() => {
    const title = editTitle.trim();
    if (title && title !== item.title) {
      onUpdateTitle(item.id, title);
    }
    setIsEditing(false);
  }, [editTitle, item.id, item.title, onUpdateTitle]);

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleSaveTitle();
      } else if (e.key === 'Escape') {
        setIsEditing(false);
        setEditTitle(item.title);
      }
    },
    [handleSaveTitle, item.title],
  );

  const handlePriorityChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onUpdatePriority(item.id, e.target.value as TodoItemType['priority']);
    },
    [item.id, onUpdatePriority],
  );

  const handleDueDateChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      onUpdateDueDate(item.id, value ? new Date(value).toISOString() : null);
    },
    [item.id, onUpdateDueDate],
  );

  const priorityClass =
    item.priority === 'high'
      ? styles.priorityHigh
      : item.priority === 'medium'
        ? styles.priorityMedium
        : item.priority === 'low'
          ? styles.priorityLow
          : null;

  const dueDateFormatted = item.dueDate ? formatDueDate(item.dueDate) : null;
  const overdue = item.dueDate ? isOverdue(item.dueDate) && !item.completed : false;

  // Convert ISO date to input[type=date] value
  const dueDateInputValue = item.dueDate ? new Date(item.dueDate).toISOString().slice(0, 10) : '';

  return (
    <div
      className={item.completed ? styles.todoItemCompleted : styles.todoItem}
      style={{ position: 'relative' }}
    >
      <button
        className={item.completed ? styles.checkboxChecked : styles.checkbox}
        onClick={() => onToggleComplete(item.id, !item.completed)}
        title={item.completed ? 'Mark incomplete' : 'Mark complete'}
      >
        {item.completed && <span className={styles.checkmark}>&#10003;</span>}
      </button>

      <div className={styles.todoContent}>
        {isEditing ? (
          <input
            ref={titleInputRef}
            className={styles.todoTitleInput}
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={handleTitleKeyDown}
            onBlur={handleSaveTitle}
          />
        ) : (
          <div
            className={item.completed ? styles.todoTitleCompleted : styles.todoTitle}
            onClick={handleStartEdit}
          >
            {item.title}
          </div>
        )}

        {(priorityClass || dueDateFormatted) && (
          <div className={styles.todoMeta}>
            {priorityClass && (
              <span className={priorityClass} onClick={() => setShowDetail(!showDetail)}>
                {item.priority}
              </span>
            )}
            {dueDateFormatted && (
              <span
                className={overdue ? styles.dueDateOverdue : styles.dueDate}
                onClick={() => setShowDetail(!showDetail)}
              >
                {dueDateFormatted}
              </span>
            )}
          </div>
        )}
      </div>

      <button
        className={styles.todoDeleteBtn}
        onClick={() => onDelete(item.id)}
        title="Delete todo"
      >
        x
      </button>

      {showDetail && (
        <div ref={detailRef} className={styles.detailPopover}>
          <div className={styles.detailField}>
            <div className={styles.detailLabel}>Priority</div>
            <select
              className={styles.detailSelect}
              value={item.priority}
              onChange={handlePriorityChange}
            >
              <option value="none">None</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div className={styles.detailField}>
            <div className={styles.detailLabel}>Due Date</div>
            <input
              className={styles.detailInput}
              type="date"
              value={dueDateInputValue}
              onChange={handleDueDateChange}
            />
          </div>
        </div>
      )}
    </div>
  );
}
