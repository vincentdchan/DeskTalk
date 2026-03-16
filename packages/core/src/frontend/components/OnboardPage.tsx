import React from 'react';
import { useAuthStore } from '../stores/auth';
import styles from './OnboardPage.module.scss';

export function OnboardPage() {
  const { user, completeOnboard } = useAuthStore();

  async function handleContinue() {
    await completeOnboard();
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>Welcome to DeskTalk</h1>
        <p className={styles.subtitle}>
          Hello, <strong>{user?.username}</strong>! Your account is ready.
        </p>
        <p className={styles.description}>
          DeskTalk is a browser-based desktop environment with an AI assistant.
          You can open apps from the dock, manage windows, and chat with the AI panel.
        </p>
        <button className={styles.button} onClick={handleContinue}>
          Get Started
        </button>
      </div>
    </div>
  );
}
