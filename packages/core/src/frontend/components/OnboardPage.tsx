import { useState, type ReactNode } from 'react';
import styles from './OnboardPage.module.scss';

export interface OnboardPageProps {
  onComplete: () => void;
}

type Step = 'welcome' | 'account' | 'done';

const STEPS: Step[] = ['welcome', 'account', 'done'];

export function OnboardPage({ onComplete }: OnboardPageProps) {
  const [step, setStep] = useState<Step>('welcome');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const stepIndex = STEPS.indexOf(step);

  function goNext() {
    setError('');
    const nextIndex = stepIndex + 1;
    if (nextIndex < STEPS.length) {
      setStep(STEPS[nextIndex]);
    }
  }

  function goBack() {
    setError('');
    const prevIndex = stepIndex - 1;
    if (prevIndex >= 0) {
      setStep(STEPS[prevIndex]);
    }
  }

  function validateAccount(): boolean {
    if (!username.trim()) {
      setError('Username is required.');
      return false;
    }
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(username)) {
      setError('Username must be 1-32 alphanumeric characters, hyphens, or underscores.');
      return false;
    }
    if (!displayName.trim()) {
      setError('Display name is required.');
      return false;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return false;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return false;
    }
    return true;
  }

  async function handleFinish() {
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          displayName: displayName.trim(),
          password,
        }),
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setError(body.error ?? 'Failed to complete setup.');
        return;
      }

      onComplete();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function renderStepDots() {
    return (
      <div className={styles.stepIndicator}>
        {STEPS.map((s, i) => {
          let className = styles.dot;
          if (i === stepIndex) className = styles.dotActive;
          else if (i < stepIndex) className = styles.dotCompleted;
          return <div key={s} className={className} />;
        })}
      </div>
    );
  }

  function renderWelcome() {
    return (
      <>
        <div className={styles.header}>
          <div className={styles.title}>Welcome to DeskTalk</div>
          <div className={styles.subtitle}>Let&apos;s create your admin account</div>
        </div>
        <div className={styles.body}>
          <p className={styles.welcomeText}>
            DeskTalk is a browser-based desktop environment with an AI assistant and modular
            MiniApps. Since this is the first time running DeskTalk, you&apos;ll need to create an
            administrator account.
          </p>
        </div>
        <div className={styles.footer}>
          <span />
          <button className={styles.buttonPrimary} type="button" onClick={goNext}>
            Get Started
          </button>
        </div>
      </>
    );
  }

  function renderAccount() {
    return (
      <>
        <div className={styles.header}>
          <div className={styles.title}>Create Admin Account</div>
          <div className={styles.subtitle}>Choose your credentials</div>
        </div>
        <div className={styles.body}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="onboard-username">
              Username
            </label>
            <input
              id="onboard-username"
              className={styles.input}
              type="text"
              placeholder="e.g. admin"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="onboard-displayname">
              Display Name
            </label>
            <input
              id="onboard-displayname"
              className={styles.input}
              type="text"
              placeholder="Your display name"
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="onboard-password">
              Password
            </label>
            <input
              id="onboard-password"
              className={styles.input}
              type="password"
              placeholder="At least 8 characters"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="onboard-confirm">
              Confirm Password
            </label>
            <input
              id="onboard-confirm"
              className={styles.input}
              type="password"
              placeholder="Re-enter your password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          <div className={styles.error}>{error}</div>
        </div>
        <div className={styles.footer}>
          <button className={styles.buttonSecondary} type="button" onClick={goBack}>
            Back
          </button>
          <button
            className={styles.buttonPrimary}
            type="button"
            onClick={() => {
              if (validateAccount()) goNext();
            }}
            disabled={!username || !displayName || !password || !confirmPassword}
          >
            Next
          </button>
        </div>
      </>
    );
  }

  function renderDone() {
    return (
      <>
        <div className={styles.header}>
          <div className={styles.title}>All Set!</div>
          <div className={styles.subtitle}>Your admin account is ready</div>
        </div>
        <div className={styles.body}>
          <p className={styles.doneText}>
            Welcome, {displayName || username}. Click below to enter your DeskTalk desktop.
          </p>
          <div className={styles.error}>{error}</div>
        </div>
        <div className={styles.footer}>
          <button className={styles.buttonSecondary} type="button" onClick={goBack}>
            Back
          </button>
          <button
            className={styles.buttonPrimary}
            type="button"
            onClick={handleFinish}
            disabled={loading}
          >
            {loading ? 'Setting up...' : 'Enter Desktop'}
          </button>
        </div>
      </>
    );
  }

  const stepRenderers: Record<Step, () => ReactNode> = {
    welcome: renderWelcome,
    account: renderAccount,
    done: renderDone,
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        {renderStepDots()}
        {stepRenderers[step]()}
      </div>
    </div>
  );
}
