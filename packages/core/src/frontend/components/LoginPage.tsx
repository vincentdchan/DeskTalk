import React, { useState } from 'react';
import { useAuthStore } from '../stores/auth';
import styles from './LoginPage.module.scss';

export function LoginPage() {
  const { error, setupMode, login, createFirstAdmin } = useAuthStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const isSetup = setupMode;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    setSubmitting(true);

    try {
      if (isSetup) {
        if (password !== confirmPassword) {
          setLocalError('Passwords do not match');
          return;
        }
        if (username.length < 3 || username.length > 32) {
          setLocalError('Username must be 3-32 characters');
          return;
        }
        if (password.length < 8) {
          setLocalError('Password must be at least 8 characters');
          return;
        }
        await createFirstAdmin(username, password);
      } else {
        await login(username, password);
      }
    } catch {
      // Error is set in the store
    } finally {
      setSubmitting(false);
    }
  }

  const displayError = localError ?? error;

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>{isSetup ? 'Create Admin Account' : 'Sign In'}</h1>
        {isSetup && (
          <p className={styles.subtitle}>Welcome to DeskTalk. Create your admin account to get started.</p>
        )}
        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>
            Username
            <input
              className={styles.input}
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              required
              minLength={3}
              maxLength={32}
            />
          </label>
          <label className={styles.label}>
            Password
            <input
              className={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={isSetup ? 8 : 1}
            />
          </label>
          {isSetup && (
            <label className={styles.label}>
              Confirm Password
              <input
                className={styles.input}
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
              />
            </label>
          )}
          {displayError && <p className={styles.error}>{displayError}</p>}
          <button type="submit" className={styles.button} disabled={submitting}>
            {submitting ? 'Please wait…' : isSetup ? 'Create Account' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
