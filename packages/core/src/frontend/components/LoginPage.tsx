import { useEffect, useState, type FormEvent } from 'react';
import styles from './LoginPage.module.scss';
import { getErrorMessage, httpClient } from '../http-client';

export interface LoginPageProps {
  onLoginSuccess: () => void;
}

export function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await httpClient.post('/api/auth/login', { username, password });

      onLoginSuccess();
    } catch (error) {
      setError(getErrorMessage(error, 'Network error. Please try again.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <dt-card class={styles.card}>
        <h1 className={styles.logo}>DeskTalk</h1>
        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="login-username">
              Username
            </label>
            <input
              id="login-username"
              className={styles.input}
              type="text"
              placeholder="Enter your username"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="login-password">
              Password
            </label>
            <input
              id="login-password"
              className={styles.input}
              type="password"
              placeholder="Enter your password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className={styles.error}>{error}</div>
          <DtButton
            variant="primary"
            disabled={loading || !username || !password}
            onPress={() => {}}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </DtButton>
        </form>
      </dt-card>
    </div>
  );
}

interface DtButtonProps {
  children: React.ReactNode;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  onPress: () => Promise<void> | void;
}

function DtButton({
  children,
  disabled = false,
  variant = 'primary',
  size = 'md',
  onPress,
}: DtButtonProps) {
  const [buttonElement, setButtonElement] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!buttonElement) {
      return;
    }

    const handleClick = () => {
      void onPress();
    };

    buttonElement.addEventListener('click', handleClick);
    return () => buttonElement.removeEventListener('click', handleClick);
  }, [buttonElement, onPress]);

  return (
    <dt-button
      ref={(element: HTMLElement | null) => setButtonElement(element)}
      disabled={disabled}
      variant={variant}
      size={size}
      fullwidth
    >
      {children}
    </dt-button>
  );
}
