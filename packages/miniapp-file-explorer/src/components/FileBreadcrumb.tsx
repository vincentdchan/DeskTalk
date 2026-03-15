import React from 'react';
import styles from '../FileExplorerApp.module.css';

interface FileBreadcrumbProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export function FileBreadcrumb({ currentPath, onNavigate }: FileBreadcrumbProps) {
  const segments = currentPath === '.' ? [] : currentPath.split('/').filter(Boolean);

  return (
    <div className={styles.breadcrumb}>
      <button
        className={
          segments.length === 0 ? styles.breadcrumbSegmentActive : styles.breadcrumbSegment
        }
        onClick={() => onNavigate('.')}
      >
        ~
      </button>
      {segments.map((segment, index) => {
        const path = segments.slice(0, index + 1).join('/');
        const isLast = index === segments.length - 1;
        return (
          <React.Fragment key={path}>
            <span className={styles.breadcrumbSeparator}>/</span>
            <button
              className={isLast ? styles.breadcrumbSegmentActive : styles.breadcrumbSegment}
              onClick={() => onNavigate(path)}
            >
              {segment}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}
