import React from 'react';
import type { TagCount } from '../types';
import styles from '../styles/NoteApp.module.css';

interface TagFilterProps {
  tags: TagCount[];
  selectedTags: Set<string>;
  onToggleTag: (tag: string) => void;
}

export function TagFilter({ tags, selectedTags, onToggleTag }: TagFilterProps) {
  return (
    <div className={styles.tagPanel}>
      <div className={styles.tagHeader}>Tags</div>
      {tags.length === 0 ? (
        <div className={styles.emptyState}>No tags yet</div>
      ) : (
        <ul className={styles.tagList}>
          {tags.map(({ tag, count }) => (
            <li
              key={tag}
              className={selectedTags.has(tag) ? styles.tagItemActive : styles.tagItem}
              onClick={() => onToggleTag(tag)}
            >
              <span>{tag}</span>
              <span className={styles.tagCount}>{count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
