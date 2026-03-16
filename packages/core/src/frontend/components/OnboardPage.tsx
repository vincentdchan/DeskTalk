import { useState, type ReactNode } from 'react';
import styles from './OnboardPage.module.scss';

export interface OnboardPageProps {
  username: string;
  displayName: string;
  onComplete: () => void;
}

type Step = 'welcome' | 'password' | 'profile' | 'preferences' | 'done';

const STEPS: Step[] = ['welcome', 'password', 'profile', 'preferences', 'done'];

export function OnboardPage({
  username,
  displayName: initialDisplayName,
  onComplete,
}: OnboardPageProps) {
  const [step, setStep] = useState<Step>('welcome');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState(initialDisplayName || username);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [language, setLanguage] = useState('en');
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

  function validatePassword(): boolean {
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return false;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return false;
    }
    return true;
  }

  async function handleFinish() {
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/me/onboard', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName,
          newPassword: newPassword || undefined,
          theme,
          language,
        }),
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setError(body.error ?? 'Failed to complete onboarding.');
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
          <div className={styles.subtitle}>Let&apos;s get you set up</div>
        </div>
        <div className={styles.body}>
          <p className={styles.welcomeText}>
            DeskTalk is a browser-based desktop environment with an AI assistant and modular
            MiniApps. This quick setup will help you personalize your experience.
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

  function renderPassword() {
    return (
      <>
        <div className={styles.header}>
          <div className={styles.title}>Set Your Password</div>
          <div className={styles.subtitle}>Choose a secure password to replace the default</div>
        </div>
        <div className={styles.body}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="onboard-password">
              New Password
            </label>
            <input
              id="onboard-password"
              className={styles.input}
              type="password"
              placeholder="At least 8 characters"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
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
              if (validatePassword()) goNext();
            }}
            disabled={!newPassword || !confirmPassword}
          >
            Next
          </button>
        </div>
      </>
    );
  }

  function renderProfile() {
    return (
      <>
        <div className={styles.header}>
          <div className={styles.title}>Profile Setup</div>
          <div className={styles.subtitle}>How should we address you?</div>
        </div>
        <div className={styles.body}>
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
        </div>
        <div className={styles.footer}>
          <button className={styles.buttonSecondary} type="button" onClick={goBack}>
            Back
          </button>
          <button
            className={styles.buttonPrimary}
            type="button"
            onClick={goNext}
            disabled={!displayName.trim()}
          >
            Next
          </button>
        </div>
      </>
    );
  }

  function renderPreferences() {
    return (
      <>
        <div className={styles.header}>
          <div className={styles.title}>Preferences</div>
          <div className={styles.subtitle}>Customize your experience</div>
        </div>
        <div className={styles.body}>
          <div className={styles.field}>
            <label className={styles.label}>Theme</label>
            <div className={styles.themeToggle}>
              <button
                className={theme === 'light' ? styles.themeOptionActive : styles.themeOption}
                type="button"
                onClick={() => setTheme('light')}
              >
                Light
              </button>
              <button
                className={theme === 'dark' ? styles.themeOptionActive : styles.themeOption}
                type="button"
                onClick={() => setTheme('dark')}
              >
                Dark
              </button>
            </div>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="onboard-language">
              Language
            </label>
            <select
              id="onboard-language"
              className={styles.select}
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              <option value="en">English</option>
              <option value="zh">Chinese</option>
              <option value="ja">Japanese</option>
            </select>
          </div>
        </div>
        <div className={styles.footer}>
          <button className={styles.buttonSecondary} type="button" onClick={goBack}>
            Back
          </button>
          <button className={styles.buttonPrimary} type="button" onClick={goNext}>
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
          <div className={styles.subtitle}>You&apos;re ready to go</div>
        </div>
        <div className={styles.body}>
          <p className={styles.doneText}>Welcome, {displayName}. Your DeskTalk desktop is ready.</p>
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
            {loading ? 'Finishing...' : 'Enter Desktop'}
          </button>
        </div>
      </>
    );
  }

  const stepRenderers: Record<Step, () => ReactNode> = {
    welcome: renderWelcome,
    password: renderPassword,
    profile: renderProfile,
    preferences: renderPreferences,
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
