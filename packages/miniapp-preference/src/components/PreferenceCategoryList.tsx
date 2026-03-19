import React from 'react';
import { CATEGORIES, type Category } from '../schema';
import styles from '../styles/PreferenceApp.module.css';

const CATEGORY_ICONS: Record<Category, string> = {
  General: '\u2699',
  Server: '\uD83C\uDF10',
  AI: '\uD83E\uDD16',
  Voice: '\uD83C\uDF99',
};

interface PreferenceCategoryListProps {
  activeCategory: string;
  onSelect: (category: string) => void;
}

export function PreferenceCategoryList({ activeCategory, onSelect }: PreferenceCategoryListProps) {
  return (
    <nav className={styles.sidebar}>
      <div className={styles.sidebarHeader}>Settings</div>
      {CATEGORIES.map((category) => (
        <button
          key={category}
          className={category === activeCategory ? styles.categoryItemActive : styles.categoryItem}
          onClick={() => onSelect(category)}
          type="button"
          data-label={category}
          aria-label={category}
          title={category}
        >
          <span className={styles.categoryIcon}>{CATEGORY_ICONS[category]}</span>
          <span className={styles.categoryText}>{category}</span>
        </button>
      ))}
    </nav>
  );
}
