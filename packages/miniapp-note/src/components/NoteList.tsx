import React, { useRef } from 'react';
import type { NoteMeta } from '../types';
import styles from '../styles/NoteApp.module.css';

interface NoteListProps {
  notes: NoteMeta[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export function NoteList({
  notes,
  selectedId,
  onSelect,
  onCreate,
  searchQuery,
  onSearchChange,
}: NoteListProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className={styles.listPanel}>
      <div className={styles.listHeader}>
        <input
          ref={inputRef}
          type="text"
          className={styles.searchInput}
          placeholder="Search notes..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        <button className={styles.newNoteBtn} onClick={onCreate} title="New note">
          +
        </button>
      </div>
      <div className={styles.noteList}>
        {notes.length === 0 ? (
          <div className={styles.emptyState}>
            {searchQuery ? 'No notes match your search' : 'No notes yet'}
          </div>
        ) : (
          notes.map((note) => (
            <div
              key={note.id}
              className={note.id === selectedId ? styles.noteItemActive : styles.noteItem}
              onClick={() => onSelect(note.id)}
            >
              <div className={styles.noteTitle}>{note.title}</div>
              <div className={styles.notePreview}>{note.preview}</div>
              <div className={styles.noteDate}>{formatDate(note.updatedAt)}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
