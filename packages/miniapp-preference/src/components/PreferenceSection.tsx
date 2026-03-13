import React from 'react';
import styles from '../styles/PreferenceApp.module.css';

interface PreferenceSectionProps {
  title: string;
  children: React.ReactNode;
}

export function PreferenceSection({ title, children }: PreferenceSectionProps) {
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      {children}
    </section>
  );
}
