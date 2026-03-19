import React from 'react';
import '@desktalk/ui'; // global JSX types for <dt-tooltip>
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
  compact?: boolean;
}

export function PreferenceCategoryList({
  activeCategory,
  onSelect,
  compact = false,
}: PreferenceCategoryListProps) {
  return (
    <nav className={styles.sidebar}>
      <div className={styles.sidebarHeader}>Settings</div>
      {CATEGORIES.map((category) => {
        const button = (
          <button
            key={category}
            className={
              category === activeCategory ? styles.categoryItemActive : styles.categoryItem
            }
            onClick={() => onSelect(category)}
            type="button"
            aria-label={compact ? category : undefined}
          >
            <span className={styles.categoryIcon}>{CATEGORY_ICONS[category]}</span>
            {!compact && <span className={styles.categoryText}>{category}</span>}
          </button>
        );

        if (compact) {
          return (
            <dt-tooltip key={category} content={category} placement="bottom">
              {button}
            </dt-tooltip>
          );
        }

        return button;
      })}
    </nav>
  );
}
