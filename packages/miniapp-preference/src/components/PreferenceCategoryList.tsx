import React from 'react';
import { CATEGORIES, type Category } from '../schema';
import styles from '../styles/PreferenceApp.module.css';

const CATEGORY_ICONS: Record<Category, string> = {
  General: '\u2699',
  Server: '\uD83C\uDF10',
  AI: '\uD83E\uDD16',
  Voice: '\uD83C\uDF99',
};

/** Icons for dynamic categories added at runtime. */
const EXTRA_CATEGORY_ICONS: Record<string, string> = {
  'Mini-Apps': '\uD83E\uDDE9',
};

interface PreferenceCategoryListProps {
  activeCategory: string;
  onSelect: (category: string) => void;
  /** Additional categories appended after the built-in ones. */
  extraCategories?: string[];
}

export function PreferenceCategoryList({
  activeCategory,
  onSelect,
  extraCategories,
}: PreferenceCategoryListProps) {
  const allCategories: string[] = [...CATEGORIES, ...(extraCategories ?? [])];

  return (
    <nav className={styles.sidebar}>
      <div className={styles.sidebarHeader}>Settings</div>
      {allCategories.map((category) => {
        const icon =
          CATEGORY_ICONS[category as Category] ?? EXTRA_CATEGORY_ICONS[category] ?? '\u2699';
        return (
          <button
            key={category}
            className={
              category === activeCategory ? styles.categoryItemActive : styles.categoryItem
            }
            onClick={() => onSelect(category)}
            type="button"
          >
            <span className={styles.categoryIcon}>{icon}</span>
            {category}
          </button>
        );
      })}
    </nav>
  );
}
